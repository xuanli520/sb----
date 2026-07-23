package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AccountStatusAudit;
import cn.edu.training.novel.domain.AdminAccount;
import cn.edu.training.novel.domain.AdminAccountPage;
import cn.edu.training.novel.domain.AdminUserBehaviorEvent;
import cn.edu.training.novel.domain.AdminUserBehaviorEventPage;
import cn.edu.training.novel.domain.AdminUserBehaviorSummary;
import cn.edu.training.novel.domain.OperatingTaxonomyAudit;
import cn.edu.training.novel.domain.OperatingTaxonomyItem;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.mapper.AdminOperationsPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/** JDBC boundary for the administrative account and taxonomy state. */
@Repository
public class AdminOperationsRepository {
    private static final String ACCOUNT_COLUMNS =
            "id, login_name, display_name, roles, enabled, created_at, updated_at";
    private static final String TAXONOMY_COLUMNS = "id, taxonomy_type, name, enabled, sort_order, "
            + "created_by_user_id, updated_by_user_id, created_at, updated_at";
    private static final RowMapper<AdminAccount> ACCOUNT_MAPPER = (resultSet, rowNumber) -> new AdminAccount(
            resultSet.getLong("id"),
            resultSet.getString("login_name"),
            resultSet.getString("display_name"),
            parseRoles(resultSet.getString("roles")),
            resultSet.getBoolean("enabled"),
            instant(resultSet.getTimestamp("created_at")),
            instant(resultSet.getTimestamp("updated_at")));
    private static final RowMapper<AccountStatusAudit> ACCOUNT_STATUS_AUDIT_MAPPER = (resultSet, rowNumber) ->
            new AccountStatusAudit(
                    resultSet.getLong("id"),
                    resultSet.getLong("account_id"),
                    resultSet.getBoolean("previous_enabled"),
                    resultSet.getBoolean("enabled"),
                    resultSet.getString("reason"),
                    resultSet.getLong("operator_user_id"),
                    instant(resultSet.getTimestamp("created_at")));
    private static final RowMapper<OperatingTaxonomyItem> TAXONOMY_MAPPER = (resultSet, rowNumber) ->
            new OperatingTaxonomyItem(
                    resultSet.getLong("id"),
                    resultSet.getString("taxonomy_type"),
                    resultSet.getString("name"),
                    resultSet.getBoolean("enabled"),
                    resultSet.getInt("sort_order"),
                    resultSet.getObject("created_by_user_id", Long.class),
                    resultSet.getObject("updated_by_user_id", Long.class),
                    instant(resultSet.getTimestamp("created_at")),
                    instant(resultSet.getTimestamp("updated_at")));
    private static final RowMapper<OperatingTaxonomyAudit> TAXONOMY_AUDIT_MAPPER = (resultSet, rowNumber) ->
            new OperatingTaxonomyAudit(
                    resultSet.getLong("id"),
                    resultSet.getLong("taxonomy_id"),
                    resultSet.getString("taxonomy_type"),
                    resultSet.getString("action"),
                    resultSet.getString("details"),
                    resultSet.getLong("operator_user_id"),
                    instant(resultSet.getTimestamp("created_at")));
    private final JdbcTemplate jdbc;
    private final AdminOperationsPageMapper pageMapper;

    public AdminOperationsRepository(JdbcTemplate jdbc, AdminOperationsPageMapper pageMapper) {
        this.jdbc = jdbc;
        this.pageMapper = pageMapper;
    }

    public AdminAccountPage findAccounts(String query, AccountFilter filter, int page, int size) {
        IPage<AdminOperationsPageMapper.AdminAccountRow> result = pageMapper.selectAccountPage(
                pageRequest(page, size, true),
                accountPattern(query),
                filter.enabled(),
                filter.role() == null ? null : "%" + filter.role().name() + "%");
        return new AdminAccountPage(
                result.getRecords().stream().map(AdminOperationsRepository::toAdminAccount).toList(),
                result.getTotal(),
                page,
                size);
    }

    public Optional<AdminAccount> findAccount(long accountId) {
        return queryOne(
                "SELECT " + ACCOUNT_COLUMNS + " FROM novel_account WHERE id = ?",
                ACCOUNT_MAPPER,
                accountId);
    }

    public Optional<AdminAccount> lockAccount(long accountId) {
        return queryOne(
                "SELECT " + ACCOUNT_COLUMNS + " FROM novel_account WHERE id = ? FOR UPDATE",
                ACCOUNT_MAPPER,
                accountId);
    }

    /**
     * Every status mutation takes this lock first, in ascending id order. It makes two requests
     * that suspend different administrators serialize before either locks its target account.
     */
    public List<AdminAccount> lockEnabledAdministrators() {
        return jdbc.query(
                "SELECT " + ACCOUNT_COLUMNS + " FROM novel_account WHERE enabled = TRUE AND roles LIKE ? "
                        + "ORDER BY id ASC FOR UPDATE",
                ACCOUNT_MAPPER,
                "%" + Role.ADMIN.name() + "%");
    }

    public AdminAccount updateAccountEnabled(long accountId, boolean enabled) {
        int changed = jdbc.update(
                "UPDATE novel_account SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                enabled,
                accountId);
        if (changed != 1) {
            throw new java.util.NoSuchElementException("account not found");
        }
        return findAccount(accountId).orElseThrow(() -> new IllegalStateException("account state was not saved"));
    }

    /** Suspension invalidates every login token. Reactivation deliberately requires a fresh login. */
    public void revokeOpenLoginSessions(long accountId) {
        jdbc.update(
                "UPDATE novel_login_session SET revoked_at = CURRENT_TIMESTAMP "
                        + "WHERE account_id = ? AND revoked_at IS NULL",
                accountId);
    }

    public AccountStatusAudit recordAccountStatusAudit(
            long accountId,
            boolean previousEnabled,
            boolean enabled,
            String reason,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_account_status_audit(account_id, previous_enabled, enabled, reason, operator_user_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, accountId);
            statement.setBoolean(2, previousEnabled);
            statement.setBoolean(3, enabled);
            statement.setString(4, reason);
            statement.setLong(5, operatorUserId);
            return statement;
        }, keyHolder);
        return findAccountStatusAudit(generatedId(keyHolder, "account status audit"))
                .orElseThrow(() -> new IllegalStateException("account status audit was not saved"));
    }

    public List<AccountStatusAudit> findAccountStatusAudits(long accountId, int limit) {
        return pageMapper.selectAccountStatusAuditPage(limitRequest(limit), accountId)
                .getRecords()
                .stream()
                .map(AdminOperationsRepository::toAccountStatusAudit)
                .toList();
    }

    public AdminUserBehaviorSummary accountBehaviorSummary(AdminAccount account) {
        long accountId = account.id();
        return new AdminUserBehaviorSummary(
                account,
                countForUser("SELECT COUNT(*) FROM novel_reader_progress WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_reader_bookshelf WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_reader_daily_checkin WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_reader_bookmark WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_book_entitlement WHERE user_id = ? AND source_type = 'PURCHASE'", accountId),
                countForUser("SELECT COUNT(*) FROM novel_redemption_code WHERE redeemed_by_user_id = ? AND status = 'REDEEMED'", accountId),
                countForUser("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_comment WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_paragraph_annotation WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_book_rating WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_book_vote WHERE user_id = ?", accountId),
                countForUser("SELECT COUNT(*) FROM novel_reader_activity_event WHERE user_id = ?", accountId),
                lastReaderActivity(accountId));
    }

    public AdminUserBehaviorEventPage findAccountBehaviorEvents(long accountId, int page, int size) {
        IPage<AdminOperationsPageMapper.AdminUserBehaviorEventRow> result =
                pageMapper.selectAccountBehaviorEventPage(pageRequest(page, size, true), accountId);
        return new AdminUserBehaviorEventPage(
                result.getRecords().stream().map(AdminOperationsRepository::toBehaviorEvent).toList(),
                result.getTotal(),
                page,
                size);
    }

    public List<OperatingTaxonomyItem> findTaxonomy(TaxonomyType type) {
        return jdbc.query(
                "SELECT " + TAXONOMY_COLUMNS + " FROM novel_operating_taxonomy WHERE taxonomy_type = ? "
                        + "ORDER BY sort_order ASC, name ASC, id ASC",
                TAXONOMY_MAPPER,
                type.name());
    }

    public List<OperatingTaxonomyItem> findEnabledTaxonomy(TaxonomyType type) {
        return jdbc.query(
                "SELECT " + TAXONOMY_COLUMNS + " FROM novel_operating_taxonomy "
                        + "WHERE taxonomy_type = ? AND enabled = TRUE ORDER BY sort_order ASC, name ASC, id ASC",
                TAXONOMY_MAPPER,
                type.name());
    }

    public Optional<OperatingTaxonomyItem> lockTaxonomy(long taxonomyId, TaxonomyType type) {
        return queryOne(
                "SELECT " + TAXONOMY_COLUMNS + " FROM novel_operating_taxonomy "
                        + "WHERE id = ? AND taxonomy_type = ? FOR UPDATE",
                TAXONOMY_MAPPER,
                taxonomyId,
                type.name());
    }

    public OperatingTaxonomyItem createTaxonomy(
            TaxonomyType type,
            String normalizedName,
            String name,
            boolean enabled,
            int sortOrder,
            long operatorUserId) {
        try {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO novel_operating_taxonomy(taxonomy_type, normalized_name, name, enabled, sort_order, "
                                + "created_by_user_id, updated_by_user_id, created_at, updated_at) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, type.name());
                statement.setString(2, normalizedName);
                statement.setString(3, name);
                statement.setBoolean(4, enabled);
                statement.setInt(5, sortOrder);
                statement.setLong(6, operatorUserId);
                statement.setLong(7, operatorUserId);
                return statement;
            }, keyHolder);
            return findTaxonomy(generatedId(keyHolder, "taxonomy item"), type)
                    .orElseThrow(() -> new IllegalStateException("taxonomy item was not saved"));
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException(type.displayName() + " already exists");
        }
    }

    public OperatingTaxonomyItem updateTaxonomy(
            long taxonomyId,
            TaxonomyType type,
            String normalizedName,
            String name,
            boolean enabled,
            int sortOrder,
            long operatorUserId) {
        try {
            int changed = jdbc.update(
                    "UPDATE novel_operating_taxonomy SET normalized_name = ?, name = ?, enabled = ?, sort_order = ?, "
                            + "updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND taxonomy_type = ?",
                    normalizedName,
                    name,
                    enabled,
                    sortOrder,
                    operatorUserId,
                    taxonomyId,
                    type.name());
            if (changed != 1) {
                throw new java.util.NoSuchElementException(type.displayName() + " not found");
            }
            return findTaxonomy(taxonomyId, type)
                    .orElseThrow(() -> new IllegalStateException("taxonomy item was not saved"));
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException(type.displayName() + " already exists");
        }
    }

    public OperatingTaxonomyAudit recordTaxonomyAudit(
            long taxonomyId,
            TaxonomyType type,
            String action,
            String details,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_operating_taxonomy_audit(taxonomy_id, taxonomy_type, action, details, operator_user_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, taxonomyId);
            statement.setString(2, type.name());
            statement.setString(3, action);
            statement.setString(4, details);
            statement.setLong(5, operatorUserId);
            return statement;
        }, keyHolder);
        return findTaxonomyAudit(generatedId(keyHolder, "taxonomy audit"))
                .orElseThrow(() -> new IllegalStateException("taxonomy audit was not saved"));
    }

    public List<OperatingTaxonomyAudit> findTaxonomyAudits(TaxonomyType type, int limit) {
        return pageMapper.selectTaxonomyAuditPage(limitRequest(limit), type.name())
                .getRecords()
                .stream()
                .map(AdminOperationsRepository::toTaxonomyAudit)
                .toList();
    }

    private Optional<AccountStatusAudit> findAccountStatusAudit(long auditId) {
        return queryOne(
                "SELECT id, account_id, previous_enabled, enabled, reason, operator_user_id, created_at "
                        + "FROM novel_account_status_audit WHERE id = ?",
                ACCOUNT_STATUS_AUDIT_MAPPER,
                auditId);
    }

    private Optional<OperatingTaxonomyItem> findTaxonomy(long taxonomyId, TaxonomyType type) {
        return queryOne(
                "SELECT " + TAXONOMY_COLUMNS + " FROM novel_operating_taxonomy "
                        + "WHERE id = ? AND taxonomy_type = ?",
                TAXONOMY_MAPPER,
                taxonomyId,
                type.name());
    }

    private Optional<OperatingTaxonomyAudit> findTaxonomyAudit(long auditId) {
        return queryOne(
                "SELECT id, taxonomy_id, taxonomy_type, action, details, operator_user_id, created_at "
                        + "FROM novel_operating_taxonomy_audit WHERE id = ?",
                TAXONOMY_AUDIT_MAPPER,
                auditId);
    }

    private long countForUser(String sql, long accountId) {
        Long count = jdbc.queryForObject(sql, Long.class, accountId);
        return count == null ? 0L : count;
    }

    private Instant lastReaderActivity(long accountId) {
        List<Timestamp> timestamps = jdbc.query(
                "SELECT MAX(occurred_at) FROM novel_reader_activity_event WHERE user_id = ?",
                (resultSet, rowNumber) -> resultSet.getTimestamp(1),
                accountId);
        return timestamps.isEmpty() ? null : nullableInstant(timestamps.getFirst());
    }

    private static AdminAccount toAdminAccount(AdminOperationsPageMapper.AdminAccountRow row) {
        return new AdminAccount(
                row.getId(),
                row.getLoginName(),
                row.getDisplayName(),
                parseRoles(row.getRoles()),
                row.isEnabled(),
                instant(row.getCreatedAt()),
                instant(row.getUpdatedAt()));
    }

    private static AdminUserBehaviorEvent toBehaviorEvent(AdminOperationsPageMapper.AdminUserBehaviorEventRow row) {
        return new AdminUserBehaviorEvent(
                row.getEventType(),
                instant(row.getOccurredAt()),
                row.getBookId(),
                row.getBookTitle(),
                row.getChapterId(),
                row.getChapterTitle(),
                row.getEventStatus());
    }

    private static AccountStatusAudit toAccountStatusAudit(AdminOperationsPageMapper.AccountStatusAuditRow row) {
        return new AccountStatusAudit(
                row.getId(),
                row.getAccountId(),
                row.isPreviousEnabled(),
                row.isEnabled(),
                row.getReason(),
                row.getOperatorUserId(),
                instant(row.getCreatedAt()));
    }

    private static OperatingTaxonomyAudit toTaxonomyAudit(AdminOperationsPageMapper.OperatingTaxonomyAuditRow row) {
        return new OperatingTaxonomyAudit(
                row.getId(),
                row.getTaxonomyId(),
                row.getTaxonomyType(),
                row.getAction(),
                row.getDetails(),
                row.getOperatorUserId(),
                instant(row.getCreatedAt()));
    }

    private static String accountPattern(String query) {
        return query == null || query.isBlank() ? null : "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
    }

    private static <T> Page<T> pageRequest(int page, int size, boolean searchCount) {
        if (page < 0) {
            throw new IllegalArgumentException("page must be non-negative");
        }
        if (size < 1 || size > 100) {
            throw new IllegalArgumentException("size must be between 1 and 100");
        }
        return new Page<>(Math.addExact((long) page, 1L), size, searchCount);
    }

    private static <T> Page<T> limitRequest(int limit) {
        return pageRequest(0, limit, false);
    }

    private static Set<Role> parseRoles(String serialized) {
        EnumSet<Role> roles = EnumSet.noneOf(Role.class);
        Arrays.stream(serialized.split(","))
                .filter(value -> !value.isBlank())
                .map(Role::valueOf)
                .forEach(roles::add);
        return Set.copyOf(roles);
    }

    private static Instant instant(Timestamp value) {
        return value.toInstant();
    }

    private static Instant nullableInstant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private <T> Optional<T> queryOne(String sql, RowMapper<T> mapper, Object... args) {
        return jdbc.query(sql, mapper, args).stream().findFirst();
    }

    private static long generatedId(KeyHolder keyHolder, String label) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a generated " + label + " id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric " + label + " id");
        }
        return number.longValue();
    }

    public record AccountFilter(Boolean enabled, Role role) {}

    public enum TaxonomyType {
        CATEGORY("category"),
        TAG("tag");

        private final String displayName;

        TaxonomyType(String displayName) {
            this.displayName = displayName;
        }

        public String displayName() {
            return displayName;
        }
    }
}
