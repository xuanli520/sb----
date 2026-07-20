package cn.edu.training.novel.service;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
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

    @Transactional(propagation = Propagation.MANDATORY)
    public long createRewardRecord(long rewarderUserId, long authorId, long bookId, long amount) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_reward_record(rewarder_user_id, author_id, book_id, amount, created_at) "
                            + "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, rewarderUserId);
            statement.setLong(2, authorId);
            statement.setLong(3, bookId);
            statement.setLong(4, amount);
            return statement;
        }, keyHolder);
        return generatedId(keyHolder);
    }

    private void ensureWallet(long userId) {
        // MySQL and H2 in MySQL compatibility mode both retain the existing row without replacing
        // its balance. Once present, the following UPDATE takes the row lock for the transaction.
        jdbc.update(
                "INSERT INTO novel_token_balance(user_id, balance, version, updated_at) VALUES (?, 0, 0, CURRENT_TIMESTAMP) "
                        + "ON DUPLICATE KEY UPDATE user_id = user_id",
                userId);
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

    private static Long nullableLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

    private static Instant toInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
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
}
