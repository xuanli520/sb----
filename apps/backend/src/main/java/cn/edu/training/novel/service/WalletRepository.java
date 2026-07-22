package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.ManagedRedemptionCode;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * JDBC persistence for the consumption domain. Mutating methods intentionally participate in the
 * caller's transaction: a redemption, balance movement, entitlement and audit event must either
 * all commit or all roll back together.
 */
@Repository
public class WalletRepository {
    private final JdbcTemplate jdbc;

    public WalletRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Acquires the code row lock before its state is inspected or moved to REDEEMED. */
    @Transactional(propagation = Propagation.MANDATORY)
    public RedemptionCode lockRedemptionCode(String code) {
        List<RedemptionCode> codes = jdbc.query(
                "SELECT code, token_amount, book_id, membership_days, status, expires_at, redeemed_at "
                        + "FROM novel_redemption_code WHERE code = ? FOR UPDATE",
                (resultSet, rowNumber) -> new RedemptionCode(
                        resultSet.getString("code"),
                        resultSet.getLong("token_amount"),
                        nullableLong(resultSet.getObject("book_id")),
                        resultSet.getInt("membership_days"),
                        resultSet.getString("status"),
                        toInstant(resultSet.getTimestamp("expires_at")),
                        toInstant(resultSet.getTimestamp("redeemed_at"))),
                code);
        if (codes.isEmpty()) {
            throw invalidRedemptionCode();
        }
        return codes.getFirst();
    }

    public void requireRedeemable(RedemptionCode code) {
        if (!"ACTIVE".equals(code.status()) || code.redeemedAt() != null
                || (code.expiresAt() != null && !code.expiresAt().isAfter(Instant.now()))) {
            throw invalidRedemptionCode();
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void markRedeemed(String code, long userId) {
        int changed = jdbc.update(
                "UPDATE novel_redemption_code "
                        + "SET status = 'REDEEMED', redeemed_by_user_id = ?, redeemed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE code = ? AND status = 'ACTIVE' AND redeemed_at IS NULL",
                userId,
                code);
        if (changed != 1) {
            // This cannot normally happen after lockRedemptionCode(), but keeps a direct JDBC caller
            // from converting a duplicate redemption into a second wallet credit.
            throw invalidRedemptionCode();
        }
    }

    public int tokenBalance(long userId) {
        List<Long> balances = jdbc.query(
                "SELECT balance FROM novel_token_balance WHERE user_id = ?",
                (resultSet, rowNumber) -> resultSet.getLong(1),
                userId);
        return balances.isEmpty() ? 0 : asApiBalance(balances.getFirst());
    }

    /** A durable book entitlement is sufficient even when its original redemption has expired. */
    public boolean hasBookEntitlement(long userId, long bookId) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_book_entitlement WHERE user_id = ? AND book_id = ?",
                Long.class,
                userId,
                bookId);
        return count != null && count > 0;
    }

    /** Membership grants reader access only while its server-owned expiration is still in the future. */
    public boolean hasActiveMembership(long userId, Instant now) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_membership_entitlement WHERE user_id = ? AND expires_at > ?",
                Long.class,
                userId,
                Timestamp.from(now));
        return count != null && count > 0;
    }

    /** Adds tokens and creates the matching append-only ledger entry while holding the wallet row lock. */
    @Transactional(propagation = Propagation.MANDATORY)
    public int creditTokens(long userId, long amount, String transactionType, String referenceType, String referenceId) {
        if (amount <= 0) {
            throw new IllegalArgumentException("token credit must be positive");
        }
        ensureWallet(userId);
        jdbc.update(
                "UPDATE novel_token_balance SET balance = balance + ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                amount,
                userId);
        long balance = lockedBalance(userId);
        appendLedger(userId, amount, balance, transactionType, referenceType, referenceId);
        return asApiBalance(balance);
    }

    /**
     * Performs a conditional debit. The balance predicate is part of the UPDATE so concurrent
     * spenders cannot both observe and consume the same funds.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public int debitTokens(long userId, long amount, String transactionType, String referenceType, String referenceId) {
        if (amount <= 0) {
            throw new IllegalArgumentException("amount must be positive");
        }
        ensureWallet(userId);
        int changed = jdbc.update(
                "UPDATE novel_token_balance "
                        + "SET balance = balance - ?, version = version + 1, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE user_id = ? AND balance >= ?",
                amount,
                userId,
                amount);
        if (changed != 1) {
            throw new IllegalStateException("insufficient tokens");
        }
        long balance = lockedBalance(userId);
        appendLedger(userId, -amount, balance, transactionType, referenceType, referenceId);
        return asApiBalance(balance);
    }

    /**
     * Records a whole-book entitlement exactly once. The primary key is the idempotency boundary
     * for duplicate/retried purchase requests.
     *
     * @return true only when this call created the entitlement
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean grantBookEntitlement(long userId, long bookId, String sourceType, String sourceReference, long purchaseAmount) {
        int changed = jdbc.update(
                "INSERT INTO novel_book_entitlement(user_id, book_id, source_type, source_reference, purchase_amount, acquired_at) "
                        + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) "
                        + "ON DUPLICATE KEY UPDATE user_id = user_id",
                userId,
                bookId,
                sourceType,
                sourceReference,
                purchaseAmount);
        return changed == 1;
    }

    /**
     * Extends a user's membership from its current valid-until time, or from now when it has
     * already lapsed. The entitlement update and immutable ledger row share the caller's
     * transaction with the redemption-code state change.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Instant grantMembershipEntitlement(
            long userId,
            int membershipDays,
            String transactionType,
            String referenceType,
            String referenceId) {
        if (membershipDays <= 0) {
            throw new IllegalArgumentException("membership days must be positive");
        }
        jdbc.update(
                "INSERT INTO novel_membership_entitlement(user_id, expires_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) "
                        + "ON DUPLICATE KEY UPDATE user_id = user_id",
                userId);
        List<Instant> expirations = jdbc.query(
                "SELECT expires_at FROM novel_membership_entitlement WHERE user_id = ? FOR UPDATE",
                (resultSet, rowNumber) -> toInstant(resultSet.getTimestamp(1)),
                userId);
        if (expirations.isEmpty()) {
            throw new IllegalStateException("membership entitlement was not initialized");
        }
        Instant now = Instant.now();
        Instant validFrom = expirations.getFirst().isAfter(now) ? expirations.getFirst() : now;
        Instant validUntil = validFrom.plus(membershipDays, ChronoUnit.DAYS);
        jdbc.update(
                "UPDATE novel_membership_entitlement SET expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                Timestamp.from(validUntil),
                userId);
        long membershipLedgerId = appendMembershipLedger(
                userId,
                membershipDays,
                validFrom,
                validUntil,
                transactionType,
                referenceType,
                referenceId);
        recordAuthorAttributedSubscription(membershipLedgerId, transactionType, referenceType, referenceId);
        return validUntil;
    }

    public List<ManagedRedemptionCode> findManagedRedemptionCodes(ManagedCodeFilter filter) {
        QueryParts filters = managedCodeFilters(filter);
        List<Object> parameters = new ArrayList<>(filters.parameters());
        parameters.add(filter.limit());
        parameters.add(filter.offset());
        return jdbc.query(
                "SELECT code, batch_no, benefit_type, token_amount, book_id, membership_days, status, expires_at, "
                        + "redeemed_by_user_id, redeemed_at, created_by_user_id, created_at, disabled_by_user_id, disabled_at "
                        + "FROM novel_redemption_code"
                        + filters.where()
                        + " ORDER BY created_at DESC, code ASC LIMIT ? OFFSET ?",
                (resultSet, rowNumber) -> managedCode(resultSet),
                parameters.toArray());
    }

    public long countManagedRedemptionCodes(ManagedCodeFilter filter) {
        QueryParts filters = managedCodeFilters(filter);
        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_redemption_code" + filters.where(),
                Long.class,
                filters.parameters().toArray());
        return total == null ? 0 : total;
    }

    public Optional<ManagedRedemptionCode> findManagedRedemptionCode(String code) {
        List<ManagedRedemptionCode> codes = jdbc.query(
                "SELECT code, batch_no, benefit_type, token_amount, book_id, membership_days, status, expires_at, "
                        + "redeemed_by_user_id, redeemed_at, created_by_user_id, created_at, disabled_by_user_id, disabled_at "
                        + "FROM novel_redemption_code WHERE code = ?",
                (resultSet, rowNumber) -> managedCode(resultSet),
                code);
        return codes.stream().findFirst();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void createManagedRedemptionCode(
            String code,
            String batchNo,
            String benefitType,
            long tokenAmount,
            Long bookId,
            int membershipDays,
            Instant expiresAt,
            long createdByUserId) {
        jdbc.update(
                "INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, book_id, membership_days, status, expires_at, "
                        + "redeemed_by_user_id, redeemed_at, created_by_user_id, created_at, updated_at, disabled_by_user_id, disabled_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, NULL, NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)",
                code,
                batchNo,
                benefitType,
                tokenAmount,
                bookId,
                membershipDays,
                timestamp(expiresAt),
                createdByUserId);
    }

    /** Changes only unconsumed codes; a redeemed or already-disabled code is never reopened. */
    @Transactional(propagation = Propagation.MANDATORY)
    public boolean disableUnusedRedemptionCode(String code, long disabledByUserId) {
        return jdbc.update(
                "UPDATE novel_redemption_code SET status = 'DISABLED', disabled_by_user_id = ?, disabled_at = CURRENT_TIMESTAMP, "
                        + "updated_at = CURRENT_TIMESTAMP WHERE code = ? AND status = 'ACTIVE' AND redeemed_at IS NULL",
                disabledByUserId,
                code) == 1;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<RewardRecord> createRewardRecord(
            long rewarderUserId,
            long authorId,
            long bookId,
            long amount,
            String idempotencyKey) {
        try {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO novel_reward_record(rewarder_user_id, author_id, book_id, amount, idempotency_key, created_at) "
                                + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setLong(1, rewarderUserId);
                statement.setLong(2, authorId);
                statement.setLong(3, bookId);
                statement.setLong(4, amount);
                statement.setString(5, idempotencyKey);
                return statement;
            }, keyHolder);
            return Optional.of(new RewardRecord(
                    generatedId(keyHolder), rewarderUserId, authorId, bookId, amount, idempotencyKey));
        } catch (DuplicateKeyException ignored) {
            // Keep the exception inside this participating transaction. Letting it escape a
            // MANDATORY proxy marks the outer transaction rollback-only before it can replay.
            return Optional.empty();
        }
    }

    /**
     * Conditionally adds a pending reward to its reader's Shanghai calendar-day allocation. The
     * conditional update is the durable concurrency boundary; a later debit failure rolls this
     * reservation back with the reward record and token ledger mutation.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void reserveRewardDailyQuota(long userId, LocalDate usageDate, long amount, long dailyLimit) {
        if (amount <= 0 || dailyLimit <= 0 || amount > dailyLimit) {
            throw new IllegalArgumentException("reward daily quota reservation is invalid");
        }
        jdbc.update(
                "INSERT INTO novel_reward_daily_usage(user_id, usage_date, used_tokens, updated_at) "
                        + "VALUES (?, ?, 0, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE user_id = user_id",
                userId,
                Date.valueOf(usageDate));
        int changed = jdbc.update(
                "UPDATE novel_reward_daily_usage SET used_tokens = used_tokens + ?, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE user_id = ? AND usage_date = ? AND used_tokens <= ?",
                amount,
                userId,
                Date.valueOf(usageDate),
                dailyLimit - amount);
        if (changed != 1) {
            throw new IllegalStateException("daily reward limit reached");
        }
    }

    /** Returns the committed reward claim for one user's idempotency key. */
    public Optional<RewardRecord> findRewardRecord(long rewarderUserId, String idempotencyKey) {
        List<RewardRecord> records = jdbc.query(
                "SELECT id, rewarder_user_id, author_id, book_id, amount, idempotency_key "
                        + "FROM novel_reward_record WHERE rewarder_user_id = ? AND idempotency_key = ?",
                (resultSet, rowNumber) -> new RewardRecord(
                        resultSet.getLong("id"),
                        resultSet.getLong("rewarder_user_id"),
                        resultSet.getLong("author_id"),
                        resultSet.getLong("book_id"),
                        resultSet.getLong("amount"),
                        resultSet.getString("idempotency_key")),
                rewarderUserId,
                idempotencyKey);
        return records.stream().findFirst();
    }

    /**
     * A locking read is a current read under MySQL REPEATABLE_READ. It is required after an
     * insert lost a unique-key race: the transaction may already have created an older
     * consistent-read snapshot before the winning request committed.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<RewardRecord> findRewardRecordForUpdate(long rewarderUserId, String idempotencyKey) {
        List<RewardRecord> records = jdbc.query(
                "SELECT id, rewarder_user_id, author_id, book_id, amount, idempotency_key "
                        + "FROM novel_reward_record WHERE rewarder_user_id = ? AND idempotency_key = ? FOR UPDATE",
                (resultSet, rowNumber) -> new RewardRecord(
                        resultSet.getLong("id"),
                        resultSet.getLong("rewarder_user_id"),
                        resultSet.getLong("author_id"),
                        resultSet.getLong("book_id"),
                        resultSet.getLong("amount"),
                        resultSet.getString("idempotency_key")),
                rewarderUserId,
                idempotencyKey);
        return records.stream().findFirst();
    }

    /**
     * The ledger preserves the exact balance returned by the first successful reward request.
     * The locking form is intentionally a current read, so a duplicate key replay cannot use
     * an earlier MySQL consistent-read snapshot that predates the committed ledger debit.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Integer> rewardBalanceAfter(RewardRecord reward) {
        List<Long> balances = jdbc.query(
                "SELECT balance_after FROM novel_token_ledger "
                        + "WHERE user_id = ? AND transaction_type = 'BOOK_REWARD' AND reference_type = 'REWARD' "
                        + "AND reference_id = ? AND change_amount = ? ORDER BY id ASC FOR UPDATE",
                (resultSet, rowNumber) -> resultSet.getLong("balance_after"),
                reward.rewarderUserId(),
                Long.toString(reward.id()),
                -reward.amount());
        return balances.stream().findFirst().map(WalletRepository::asApiBalance);
    }

    private void ensureWallet(long userId) {
        // MySQL and H2 in MySQL compatibility mode both retain the existing row without replacing
        // its balance. Once present, the following UPDATE takes the row lock for the transaction.
        jdbc.update(
                "INSERT INTO novel_token_balance(user_id, balance, version, updated_at) VALUES (?, 0, 0, CURRENT_TIMESTAMP) "
                        + "ON DUPLICATE KEY UPDATE user_id = user_id",
                userId);
    }

    private static ManagedRedemptionCode managedCode(java.sql.ResultSet resultSet) throws java.sql.SQLException {
        return new ManagedRedemptionCode(
                resultSet.getString("code"),
                resultSet.getString("batch_no"),
                resultSet.getString("benefit_type"),
                resultSet.getLong("token_amount"),
                nullableLong(resultSet.getObject("book_id")),
                resultSet.getInt("membership_days"),
                resultSet.getString("status"),
                toInstant(resultSet.getTimestamp("expires_at")),
                nullableLong(resultSet.getObject("redeemed_by_user_id")),
                toInstant(resultSet.getTimestamp("redeemed_at")),
                nullableLong(resultSet.getObject("created_by_user_id")),
                toInstant(resultSet.getTimestamp("created_at")),
                nullableLong(resultSet.getObject("disabled_by_user_id")),
                toInstant(resultSet.getTimestamp("disabled_at")));
    }

    private static QueryParts managedCodeFilters(ManagedCodeFilter filter) {
        StringBuilder where = new StringBuilder(" WHERE 1 = 1");
        List<Object> parameters = new ArrayList<>();
        if (filter.codeQuery() != null && !filter.codeQuery().isBlank()) {
            where.append(" AND code LIKE ?");
            parameters.add("%" + filter.codeQuery() + "%");
        }
        if (filter.batchNo() != null && !filter.batchNo().isBlank()) {
            where.append(" AND batch_no = ?");
            parameters.add(filter.batchNo());
        }
        if (filter.benefitType() != null && !filter.benefitType().isBlank()) {
            where.append(" AND benefit_type = ?");
            parameters.add(filter.benefitType());
        }
        if (filter.status() != null && !filter.status().isBlank()) {
            switch (filter.status()) {
                case "ACTIVE" -> where.append(" AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)");
                case "EXPIRED" -> where.append(" AND status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP");
                case "REDEEMED", "DISABLED" -> {
                    where.append(" AND status = ?");
                    parameters.add(filter.status());
                }
                default -> throw new IllegalArgumentException("unsupported redemption-code status");
            }
        }
        return new QueryParts(where.toString(), List.copyOf(parameters));
    }

    private long lockedBalance(long userId) {
        List<Long> balances = jdbc.query(
                "SELECT balance FROM novel_token_balance WHERE user_id = ? FOR UPDATE",
                (resultSet, rowNumber) -> resultSet.getLong(1),
                userId);
        if (balances.isEmpty()) {
            throw new IllegalStateException("wallet was not initialized");
        }
        return balances.getFirst();
    }

    private void appendLedger(long userId, long changeAmount, long balanceAfter, String transactionType, String referenceType, String referenceId) {
        jdbc.update(
                "INSERT INTO novel_token_ledger(user_id, change_amount, balance_after, transaction_type, reference_type, reference_id, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                userId,
                changeAmount,
                balanceAfter,
                transactionType,
                referenceType,
                referenceId);
    }

    private long appendMembershipLedger(
            long userId,
            int membershipDays,
            Instant validFrom,
            Instant validUntil,
            String transactionType,
            String referenceType,
            String referenceId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_membership_ledger(user_id, membership_days, valid_from, valid_until, transaction_type, reference_type, reference_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, userId);
            statement.setInt(2, membershipDays);
            statement.setTimestamp(3, Timestamp.from(validFrom));
            statement.setTimestamp(4, Timestamp.from(validUntil));
            statement.setString(5, transactionType);
            statement.setString(6, referenceType);
            statement.setString(7, referenceId);
            return statement;
        }, keyHolder);
        return generatedId(keyHolder);
    }

    /**
     * An author can only receive a subscription attribution when the redeemed membership code
     * explicitly names one of that author's books. The INSERT SELECT snapshots that ownership and
     * copies the source membership-ledger timestamp, so later catalog changes cannot rewrite the
     * audit trail. The unique membership_ledger_id makes retries non-duplicating at the database
     * boundary.
     */
    private void recordAuthorAttributedSubscription(
            long membershipLedgerId, String transactionType, String referenceType, String referenceId) {
        if (!"REDEMPTION".equals(transactionType) || !"REDEMPTION_CODE".equals(referenceType)) {
            return;
        }
        jdbc.update(
                "INSERT INTO novel_author_subscription_ledger("
                        + "membership_ledger_id, reader_user_id, author_id, book_id, membership_days, source_type, source_reference, occurred_at) "
                        + "SELECT membership.id, membership.user_id, book.author_id, code.book_id, membership.membership_days, "
                        + "'MEMBERSHIP_REDEMPTION', membership.reference_id, membership.created_at "
                        + "FROM novel_membership_ledger membership "
                        + "JOIN novel_redemption_code code ON code.code = membership.reference_id "
                        + "JOIN novel_book book ON book.id = code.book_id "
                        + "WHERE membership.id = ? AND membership.transaction_type = 'REDEMPTION' "
                        + "AND membership.reference_type = 'REDEMPTION_CODE' AND code.book_id IS NOT NULL",
                membershipLedgerId);
    }

    private static Long nullableLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

    private static Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private static int asApiBalance(long balance) {
        try {
            return Math.toIntExact(balance);
        } catch (ArithmeticException exception) {
            throw new IllegalStateException("token balance exceeds API range", exception);
        }
    }

    private static long generatedId(KeyHolder keyHolder) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a generated key");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric generated key");
        }
        return number.longValue();
    }

    private static IllegalStateException invalidRedemptionCode() {
        return new IllegalStateException("兑换码无效、已使用或已禁用");
    }

    public record RedemptionCode(
            String code,
            long tokenAmount,
            Long bookId,
            int membershipDays,
            String status,
            Instant expiresAt,
            Instant redeemedAt) {}

    public record RewardRecord(
            long id,
            long rewarderUserId,
            long authorId,
            long bookId,
            long amount,
            String idempotencyKey) {}

    public record ManagedCodeFilter(
            String codeQuery,
            String batchNo,
            String benefitType,
            String status,
            int limit,
            int offset) {}

    private record QueryParts(String where, List<Object> parameters) {}
}
