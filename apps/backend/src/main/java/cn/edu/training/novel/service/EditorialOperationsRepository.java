package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.EditorialRecommendation;
import cn.edu.training.novel.domain.EditorialRecommendationAudit;
import cn.edu.training.novel.domain.EditorialRecommendationAuditPage;
import cn.edu.training.novel.domain.EditorialRecommendationPage;
import cn.edu.training.novel.domain.HotSearchTerm;
import cn.edu.training.novel.domain.HotSearchTermAudit;
import cn.edu.training.novel.domain.HotSearchTermAuditPage;
import cn.edu.training.novel.domain.HotSearchTermPage;
import cn.edu.training.novel.domain.PageMeta;
import cn.edu.training.novel.mapper.EditorialOperationsPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * JDBC boundary for the operations-owned editorial placement and hot-search configuration.
 * Rank writes are deliberately small, explicit statements: the service parks rows at temporary
 * ranks before it writes their final order, which works consistently with a unique rank index.
 */
@Repository
public class EditorialOperationsRepository {
    public static final int MAX_RANK = 100_000;
    private static final int TEMPORARY_RANK_BASE = 1_000_000;
    private static final String BOOK_COLUMNS = "id, title, author_name, category, word_count, serial_status, "
            + "synopsis, NULL AS cover, status, author_id, heat, purchase_price";
    private static final RowMapper<Book> BOOK_MAPPER = (resultSet, rowNumber) -> new Book(
            resultSet.getLong("id"),
            resultSet.getString("title"),
            resultSet.getString("author_name"),
            resultSet.getString("category"),
            resultSet.getInt("word_count"),
            resultSet.getString("serial_status"),
            resultSet.getString("synopsis"),
            null,
            BookStatus.valueOf(resultSet.getString("status")),
            resultSet.getLong("author_id"),
            resultSet.getLong("heat"),
            resultSet.getLong("purchase_price"));
    private static final RowMapper<EditorialRecommendation> RECOMMENDATION_MAPPER = (resultSet, rowNumber) ->
            new EditorialRecommendation(BOOK_MAPPER.mapRow(resultSet, rowNumber), resultSet.getInt("editorial_rank"));
    private static final RowMapper<EditorialRecommendationAudit> RECOMMENDATION_AUDIT_MAPPER = (resultSet, rowNumber) ->
            new EditorialRecommendationAudit(
                    resultSet.getLong("id"),
                    resultSet.getLong("book_id"),
                    resultSet.getString("action"),
                    resultSet.getObject("previous_rank", Integer.class),
                    resultSet.getObject("new_rank", Integer.class),
                    resultSet.getString("details"),
                    resultSet.getLong("operator_user_id"),
                    instant(resultSet.getTimestamp("created_at")));
    private static final RowMapper<HotSearchTerm> HOT_SEARCH_TERM_MAPPER = (resultSet, rowNumber) -> new HotSearchTerm(
            resultSet.getLong("id"),
            resultSet.getString("term"),
            resultSet.getBoolean("enabled"),
            resultSet.getInt("display_rank"),
            resultSet.getObject("created_by_user_id", Long.class),
            resultSet.getObject("updated_by_user_id", Long.class),
            instant(resultSet.getTimestamp("created_at")),
            instant(resultSet.getTimestamp("updated_at")));
    private static final RowMapper<HotSearchTermAudit> HOT_SEARCH_AUDIT_MAPPER = (resultSet, rowNumber) ->
            new HotSearchTermAudit(
                    resultSet.getLong("id"),
                    resultSet.getLong("term_id"),
                    resultSet.getString("term"),
                    resultSet.getString("action"),
                    resultSet.getObject("previous_rank", Integer.class),
                    resultSet.getObject("new_rank", Integer.class),
                    resultSet.getString("details"),
                    resultSet.getLong("operator_user_id"),
                    instant(resultSet.getTimestamp("created_at")));

    private final JdbcTemplate jdbc;
    private final EditorialOperationsPageMapper pageMapper;

    public EditorialOperationsRepository(JdbcTemplate jdbc, EditorialOperationsPageMapper pageMapper) {
        this.jdbc = jdbc;
        this.pageMapper = pageMapper;
    }

    /** Serializes any request that can rewrite an editorial or hot-search order. */
    public void lockOrdering() {
        Integer lockId = jdbc.queryForObject(
                "SELECT id FROM novel_editorial_operation_lock WHERE id = 1 FOR UPDATE",
                Integer.class);
        if (lockId == null) {
            throw new IllegalStateException("editorial operation lock is unavailable");
        }
        jdbc.update("UPDATE novel_editorial_operation_lock SET updated_at = CURRENT_TIMESTAMP WHERE id = 1");
    }

    public EditorialRecommendationPage findRecommendationPage(int page, int size) {
        IPage<EditorialOperationsPageMapper.EditorialRecommendationRow> result =
                pageMapper.selectRecommendationPage(pageRequest(page, size, true));
        return new EditorialRecommendationPage(
                result.getRecords().stream().map(EditorialOperationsRepository::toRecommendation).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    public List<EditorialRecommendation> lockRecommendations() {
        return jdbc.query(
                "SELECT " + BOOK_COLUMNS + ", editorial_rank FROM novel_book "
                        + "WHERE editorial_rank IS NOT NULL ORDER BY editorial_rank ASC, id ASC FOR UPDATE",
                RECOMMENDATION_MAPPER);
    }

    public Optional<Book> findBookForUpdate(long bookId) {
        return queryOne(
                "SELECT " + BOOK_COLUMNS + " FROM novel_book WHERE id = ? FOR UPDATE",
                BOOK_MAPPER,
                bookId);
    }

    /** Move all occupied recommendation ranks out of the live range before writing a new order. */
    public void parkRecommendationRanks(List<EditorialRecommendation> current) {
        for (int index = 0; index < current.size(); index++) {
            jdbc.update(
                    "UPDATE novel_book SET editorial_rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    temporaryRank(index),
                    current.get(index).book().id());
        }
    }

    public void writeRecommendationRanks(List<EditorialRecommendation> ordered) {
        for (int index = 0; index < ordered.size(); index++) {
            jdbc.update(
                    "UPDATE novel_book SET editorial_rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    index + 1,
                    ordered.get(index).book().id());
        }
    }

    public void clearRecommendationRank(long bookId) {
        jdbc.update(
                "UPDATE novel_book SET editorial_rank = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                bookId);
    }

    public EditorialRecommendationAudit recordRecommendationAudit(
            long bookId,
            String action,
            Integer previousRank,
            Integer rank,
            String details,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_editorial_recommendation_audit("
                            + "book_id, action, previous_rank, new_rank, details, operator_user_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, bookId);
            statement.setString(2, action);
            setNullableInteger(statement, 3, previousRank);
            setNullableInteger(statement, 4, rank);
            statement.setString(5, details);
            statement.setLong(6, operatorUserId);
            return statement;
        }, keyHolder);
        return findRecommendationAudit(generatedId(keyHolder, "recommendation audit"))
                .orElseThrow(() -> new IllegalStateException("recommendation audit was not saved"));
    }

    public EditorialRecommendationAuditPage findRecommendationAuditPage(int page, int size) {
        IPage<EditorialOperationsPageMapper.EditorialRecommendationAuditRow> result =
                pageMapper.selectRecommendationAuditPage(pageRequest(page, size, true));
        return new EditorialRecommendationAuditPage(
                result.getRecords().stream().map(EditorialOperationsRepository::toRecommendationAudit).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    public HotSearchTermPage findHotSearchTermPage(int page, int size) {
        IPage<EditorialOperationsPageMapper.HotSearchTermRow> result =
                pageMapper.selectHotSearchTermPage(pageRequest(page, size, true));
        return new HotSearchTermPage(
                result.getRecords().stream().map(EditorialOperationsRepository::toHotSearchTerm).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    public List<HotSearchTerm> lockHotSearchTerms() {
        return jdbc.query(
                "SELECT id, term, enabled, display_rank, created_by_user_id, updated_by_user_id, created_at, updated_at "
                        + "FROM novel_hot_search_term ORDER BY display_rank ASC, id ASC FOR UPDATE",
                HOT_SEARCH_TERM_MAPPER);
    }

    public List<HotSearchTerm> findEnabledHotSearchTerms(int size) {
        return pageMapper.selectEnabledHotSearchTermPage(pageRequest(0, size, false))
                .getRecords()
                .stream()
                .map(EditorialOperationsRepository::toHotSearchTerm)
                .toList();
    }

    public Optional<HotSearchTerm> findHotSearchTerm(long termId) {
        return queryOne(
                "SELECT id, term, enabled, display_rank, created_by_user_id, updated_by_user_id, created_at, updated_at "
                        + "FROM novel_hot_search_term WHERE id = ?",
                HOT_SEARCH_TERM_MAPPER,
                termId);
    }

    public HotSearchTerm createHotSearchTerm(
            String normalizedTerm,
            String term,
            boolean enabled,
            int temporaryRank,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_hot_search_term("
                            + "normalized_term, term, enabled, display_rank, created_by_user_id, updated_by_user_id, created_at, updated_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, normalizedTerm);
            statement.setString(2, term);
            statement.setBoolean(3, enabled);
            statement.setInt(4, temporaryRank);
            statement.setLong(5, operatorUserId);
            statement.setLong(6, operatorUserId);
            return statement;
        }, keyHolder);
        return findHotSearchTerm(generatedId(keyHolder, "hot-search term"))
                .orElseThrow(() -> new IllegalStateException("hot-search term was not saved"));
    }

    public void parkHotSearchTermRanks(List<HotSearchTerm> current) {
        for (int index = 0; index < current.size(); index++) {
            jdbc.update(
                    "UPDATE novel_hot_search_term SET display_rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    temporaryRank(index),
                    current.get(index).id());
        }
    }

    public void writeHotSearchTermRanks(List<HotSearchTerm> ordered) {
        for (int index = 0; index < ordered.size(); index++) {
            jdbc.update(
                    "UPDATE novel_hot_search_term SET display_rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    index + 1,
                    ordered.get(index).id());
        }
    }

    public HotSearchTerm updateHotSearchTermDetails(
            long termId,
            String normalizedTerm,
            String term,
            boolean enabled,
            long operatorUserId) {
        int changed = jdbc.update(
                "UPDATE novel_hot_search_term SET normalized_term = ?, term = ?, enabled = ?, "
                        + "updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                normalizedTerm,
                term,
                enabled,
                operatorUserId,
                termId);
        if (changed != 1) {
            throw new java.util.NoSuchElementException("hot-search term not found");
        }
        return findHotSearchTerm(termId)
                .orElseThrow(() -> new IllegalStateException("hot-search term was not saved"));
    }

    public void deleteHotSearchTerm(long termId) {
        int changed = jdbc.update("DELETE FROM novel_hot_search_term WHERE id = ?", termId);
        if (changed != 1) {
            throw new java.util.NoSuchElementException("hot-search term not found");
        }
    }

    public HotSearchTermAudit recordHotSearchTermAudit(
            long termId,
            String term,
            String action,
            Integer previousRank,
            Integer rank,
            String details,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_hot_search_term_audit("
                            + "term_id, term, action, previous_rank, new_rank, details, operator_user_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, termId);
            statement.setString(2, term);
            statement.setString(3, action);
            setNullableInteger(statement, 4, previousRank);
            setNullableInteger(statement, 5, rank);
            statement.setString(6, details);
            statement.setLong(7, operatorUserId);
            return statement;
        }, keyHolder);
        return findHotSearchTermAudit(generatedId(keyHolder, "hot-search audit"))
                .orElseThrow(() -> new IllegalStateException("hot-search audit was not saved"));
    }

    public HotSearchTermAuditPage findHotSearchTermAuditPage(int page, int size) {
        IPage<EditorialOperationsPageMapper.HotSearchTermAuditRow> result =
                pageMapper.selectHotSearchTermAuditPage(pageRequest(page, size, true));
        return new HotSearchTermAuditPage(
                result.getRecords().stream().map(EditorialOperationsRepository::toHotSearchTermAudit).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    public int temporaryRankFor(int index) {
        return temporaryRank(index);
    }

    private Optional<EditorialRecommendationAudit> findRecommendationAudit(long auditId) {
        return queryOne(
                "SELECT id, book_id, action, previous_rank, new_rank, details, operator_user_id, created_at "
                        + "FROM novel_editorial_recommendation_audit WHERE id = ?",
                RECOMMENDATION_AUDIT_MAPPER,
                auditId);
    }

    private Optional<HotSearchTermAudit> findHotSearchTermAudit(long auditId) {
        return queryOne(
                "SELECT id, term_id, term, action, previous_rank, new_rank, details, operator_user_id, created_at "
                        + "FROM novel_hot_search_term_audit WHERE id = ?",
                HOT_SEARCH_AUDIT_MAPPER,
                auditId);
    }

    private <T> Optional<T> queryOne(String sql, RowMapper<T> mapper, Object... args) {
        return jdbc.query(sql, mapper, args).stream().findFirst();
    }

    private static EditorialRecommendation toRecommendation(EditorialOperationsPageMapper.EditorialRecommendationRow row) {
        return new EditorialRecommendation(
                new Book(
                        row.getBookId(),
                        row.getBookTitle(),
                        row.getBookAuthor(),
                        row.getBookCategory(),
                        row.getBookWords(),
                        row.getBookSerialStatus(),
                        row.getBookSynopsis(),
                        null,
                        BookStatus.valueOf(row.getBookStatus()),
                        row.getBookAuthorId(),
                        row.getBookHeat(),
                        row.getBookPurchasePrice()),
                row.getRank());
    }

    private static EditorialRecommendationAudit toRecommendationAudit(
            EditorialOperationsPageMapper.EditorialRecommendationAuditRow row) {
        return new EditorialRecommendationAudit(
                row.getId(),
                row.getBookId(),
                row.getAction(),
                row.getPreviousRank(),
                row.getRank(),
                row.getDetails(),
                row.getOperatorUserId(),
                instant(row.getCreatedAt()));
    }

    private static HotSearchTerm toHotSearchTerm(EditorialOperationsPageMapper.HotSearchTermRow row) {
        return new HotSearchTerm(
                row.getId(),
                row.getTerm(),
                row.isEnabled(),
                row.getRank(),
                row.getCreatedByUserId(),
                row.getUpdatedByUserId(),
                instant(row.getCreatedAt()),
                instant(row.getUpdatedAt()));
    }

    private static HotSearchTermAudit toHotSearchTermAudit(EditorialOperationsPageMapper.HotSearchTermAuditRow row) {
        return new HotSearchTermAudit(
                row.getId(),
                row.getTermId(),
                row.getTerm(),
                row.getAction(),
                row.getPreviousRank(),
                row.getRank(),
                row.getDetails(),
                row.getOperatorUserId(),
                instant(row.getCreatedAt()));
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

    private static int temporaryRank(int index) {
        if (index < 0 || index >= MAX_RANK) {
            throw new IllegalStateException("too many editorial ranks to rewrite safely");
        }
        return TEMPORARY_RANK_BASE + index;
    }

    private static void setNullableInteger(PreparedStatement statement, int parameter, Integer value)
            throws java.sql.SQLException {
        if (value == null) {
            statement.setNull(parameter, java.sql.Types.INTEGER);
        } else {
            statement.setInt(parameter, value);
        }
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
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
}
