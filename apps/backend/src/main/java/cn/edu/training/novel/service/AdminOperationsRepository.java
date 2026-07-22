package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AccountStatusAudit;
import cn.edu.training.novel.domain.AdminAccount;
import cn.edu.training.novel.domain.AdminUserBehaviorEvent;
import cn.edu.training.novel.domain.AdminUserBehaviorEventPage;
import cn.edu.training.novel.domain.AdminUserBehaviorSummary;
import cn.edu.training.novel.domain.OperatingTaxonomyAudit;
import cn.edu.training.novel.domain.OperatingTaxonomyItem;
import cn.edu.training.novel.domain.Role;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
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
    private static final RowMapper<AdminUserBehaviorEvent> ACCOUNT_BEHAVIOR_EVENT_MAPPER = (resultSet, rowNumber) ->
            new AdminUserBehaviorEvent(
                    resultSet.getString("event_type"),
                    instant(resultSet.getTimestamp("occurred_at")),
                    resultSet.getObject("book_id", Long.class),
                    resultSet.getString("book_title"),
                    resultSet.getObject("chapter_id", Long.class),
                    resultSet.getString("chapter_title"),
                    resultSet.getString("event_status"));
    private static final int ACCOUNT_BEHAVIOR_EVENT_ACCOUNT_PARAMETER_COUNT = 12;
    private static final String ACCOUNT_BEHAVIOR_EVENT_UNION = """
            SELECT 'READING_PROGRESS' AS event_type, progress.updated_at AS occurred_at,
                   progress.book_id AS book_id, book.title AS book_title, progress.chapter_id AS chapter_id,
                   chapter.title AS chapter_title, NULL AS event_status,
                   CONCAT('progress:', progress.book_id) AS sort_key
              FROM novel_reader_progress progress
              LEFT JOIN novel_book book ON book.id = progress.book_id
              LEFT JOIN novel_chapter chapter ON chapter.id = progress.chapter_id
             WHERE progress.user_id = ?
            UNION ALL
            SELECT 'BOOKSHELF_ADDED', shelf.added_at, shelf.book_id, book.title, NULL, NULL, NULL,
                   CONCAT('shelf:', shelf.book_id)
              FROM novel_reader_bookshelf shelf
              LEFT JOIN novel_book book ON book.id = shelf.book_id
             WHERE shelf.user_id = ?
            UNION ALL
            SELECT 'CHECKIN', checkin_row.created_at, NULL, NULL, NULL, NULL, NULL,
                   CONCAT('checkin:', checkin_row.checkin_date)
              FROM novel_reader_daily_checkin checkin_row
             WHERE checkin_row.user_id = ?
            UNION ALL
            SELECT 'BOOKMARK_CREATED', bookmark.created_at, bookmark.book_id, book.title, bookmark.chapter_id,
                   chapter.title, NULL, CONCAT('bookmark:', bookmark.id)
              FROM novel_reader_bookmark bookmark
              LEFT JOIN novel_book book ON book.id = bookmark.book_id
              LEFT JOIN novel_chapter chapter ON chapter.id = bookmark.chapter_id
             WHERE bookmark.user_id = ?
            UNION ALL
            SELECT 'BOOK_PURCHASE', entitlement.acquired_at, entitlement.book_id, book.title, NULL, NULL,
                   entitlement.source_type, CONCAT('purchase:', entitlement.book_id)
              FROM novel_book_entitlement entitlement
              LEFT JOIN novel_book book ON book.id = entitlement.book_id
             WHERE entitlement.user_id = ? AND entitlement.source_type = 'PURCHASE'
            UNION ALL
            SELECT 'REDEMPTION', redemption.redeemed_at, redemption.book_id, book.title, NULL, NULL,
                   redemption.benefit_type, CONCAT('redemption:', redemption.code)
              FROM novel_redemption_code redemption
              LEFT JOIN novel_book book ON book.id = redemption.book_id
             WHERE redemption.redeemed_by_user_id = ? AND redemption.status = 'REDEEMED'
            UNION ALL
            SELECT 'REWARD_SENT', reward.created_at, reward.book_id, book.title, NULL, NULL, NULL,
                   CONCAT('reward:', reward.id)
              FROM novel_reward_record reward
              LEFT JOIN novel_book book ON book.id = reward.book_id
             WHERE reward.rewarder_user_id = ?
            UNION ALL
            SELECT 'COMMENT_SUBMITTED', comment_row.created_at, comment_row.book_id, book.title,
                   comment_row.chapter_id, chapter.title, comment_row.status, CONCAT('comment:', comment_row.id)
              FROM novel_comment comment_row
              LEFT JOIN novel_book book ON book.id = comment_row.book_id
              LEFT JOIN novel_chapter chapter ON chapter.id = comment_row.chapter_id
             WHERE comment_row.user_id = ?
            UNION ALL
            SELECT 'ANNOTATION_SUBMITTED', annotation.created_at, annotation.book_id, book.title,
                   annotation.chapter_id, chapter.title, annotation.status, CONCAT('annotation:', annotation.id)
              FROM novel_paragraph_annotation annotation
              LEFT JOIN novel_book book ON book.id = annotation.book_id
              LEFT JOIN novel_chapter chapter ON chapter.id = annotation.chapter_id
             WHERE annotation.user_id = ?
            UNION ALL
            SELECT 'RATING_RECORDED', rating.updated_at, rating.book_id, book.title, NULL, NULL, NULL,
                   CONCAT('rating:', rating.book_id)
              FROM novel_book_rating rating
              LEFT JOIN novel_book book ON book.id = rating.book_id
             WHERE rating.user_id = ?
            UNION ALL
            SELECT 'VOTE_CAST', vote.created_at, vote.book_id, book.title, NULL, NULL, vote.vote_type,
                   CONCAT('vote:', vote.book_id, ':', vote.vote_type)
              FROM novel_book_vote vote
              LEFT JOIN novel_book book ON book.id = vote.book_id
             WHERE vote.user_id = ?
            UNION ALL
            SELECT 'READING_ACTIVITY', activity.occurred_at, activity.book_id, book.title, activity.chapter_id,
                   chapter.title, activity.event_type, CONCAT('activity:', activity.id)
              FROM novel_reader_activity_event activity
              LEFT JOIN novel_book book ON book.id = activity.book_id
              LEFT JOIN novel_chapter chapter ON chapter.id = activity.chapter_id
             WHERE activity.user_id = ?
            """;

    private final JdbcTemplate jdbc;

    public AdminOperationsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<AdminAccount> findAccounts(String query, AccountFilter filter, int limit, int offset) {
        QueryParts parts = accountWhere(query, filter);
        List<Object> args = new ArrayList<>(parts.args());
        args.add(limit);
        args.add(offset);
        return jdbc.query(
                "SELECT " + ACCOUNT_COLUMNS + " FROM novel_account" + parts.sql()
                        + " ORDER BY id DESC LIMIT ? OFFSET ?",
                ACCOUNT_MAPPER,
                args.toArray());
    }

    public long countAccounts(String query, AccountFilter filter) {
        QueryParts parts = accountWhere(query, filter);
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account" + parts.sql(),
                Long.class,
                parts.args().toArray());
        return count == null ? 0L : count;
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
        return jdbc.query(
                "SELECT id, account_id, previous_enabled, enabled, reason, operator_user_id, created_at "
                        + "FROM novel_account_status_audit WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                ACCOUNT_STATUS_AUDIT_MAPPER,
                accountId,
                limit);
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
        int offset = Math.multiplyExact(page, size);
        List<Object> countArgs = accountBehaviorEventArguments(accountId);
        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM (" + ACCOUNT_BEHAVIOR_EVENT_UNION + ") behavior_events",
                Long.class,
                countArgs.toArray());

        List<Object> pageArgs = accountBehaviorEventArguments(accountId);
        pageArgs.add(size);
        pageArgs.add(offset);
        List<AdminUserBehaviorEvent> items = jdbc.query(
                "SELECT event_type, occurred_at, book_id, book_title, chapter_id, chapter_title, event_status "
                        + "FROM (" + ACCOUNT_BEHAVIOR_EVENT_UNION + ") behavior_events "
                        + "ORDER BY occurred_at DESC, event_type ASC, sort_key DESC LIMIT ? OFFSET ?",
                ACCOUNT_BEHAVIOR_EVENT_MAPPER,
                pageArgs.toArray());
        return new AdminUserBehaviorEventPage(items, total == null ? 0L : total, page, size);
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
        return jdbc.query(
                "SELECT id, taxonomy_id, taxonomy_type, action, details, operator_user_id, created_at "
                        + "FROM novel_operating_taxonomy_audit WHERE taxonomy_type = ? "
                        + "ORDER BY created_at DESC, id DESC LIMIT ?",
                TAXONOMY_AUDIT_MAPPER,
                type.name(),
                limit);
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

    private static List<Object> accountBehaviorEventArguments(long accountId) {
        List<Object> arguments = new ArrayList<>(ACCOUNT_BEHAVIOR_EVENT_ACCOUNT_PARAMETER_COUNT);
        for (int index = 0; index < ACCOUNT_BEHAVIOR_EVENT_ACCOUNT_PARAMETER_COUNT; index++) {
            arguments.add(accountId);
        }
        return arguments;
    }

    private QueryParts accountWhere(String query, AccountFilter filter) {
        List<String> predicates = new ArrayList<>();
        List<Object> args = new ArrayList<>();
        if (query != null && !query.isBlank()) {
            String needle = "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
            predicates.add("(LOWER(login_name) LIKE ? OR LOWER(display_name) LIKE ?)");
            args.add(needle);
            args.add(needle);
        }
        if (filter.enabled() != null) {
            predicates.add("enabled = ?");
            args.add(filter.enabled());
        }
        if (filter.role() != null) {
            predicates.add("roles LIKE ?");
            args.add("%" + filter.role().name() + "%");
        }
        return new QueryParts(predicates.isEmpty() ? "" : " WHERE " + String.join(" AND ", predicates), args);
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

    private record QueryParts(String sql, List<Object> args) {}
}
