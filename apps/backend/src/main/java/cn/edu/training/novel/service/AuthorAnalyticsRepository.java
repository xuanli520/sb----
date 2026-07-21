package cn.edu.training.novel.service;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Read-only source queries for author analytics. Every query joins the catalog and applies the
 * author id at the database boundary, so rows from another author's work never enter a report.
 */
@Repository
public class AuthorAnalyticsRepository {
    private final JdbcTemplate jdbc;

    public AuthorAnalyticsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean ownsBook(long authorId, long bookId) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_book WHERE author_id = ? AND id = ?",
                Long.class,
                authorId,
                bookId);
        return count != null && count > 0;
    }

    public long countOwnedBooks(AnalyticsFilter filter) {
        QueryParts filters = ownedBooks(filter);
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_book b" + filters.where(),
                Long.class,
                filters.parameters().toArray());
        return count == null ? 0 : count;
    }

    public List<BookRef> findBooks(AnalyticsFilter filter, int limit) {
        QueryParts filters = ownedBooks(filter);
        List<Object> parameters = new ArrayList<>(filters.parameters());
        parameters.add(limit);
        return jdbc.query(
                "SELECT b.id, b.title FROM novel_book b" + filters.where() + " ORDER BY b.id DESC LIMIT ?",
                (resultSet, rowNumber) -> new BookRef(resultSet.getLong("id"), resultSet.getString("title")),
                parameters.toArray());
    }

    public long countCurrentFavorites(AnalyticsFilter filter) {
        QueryParts filters = ownerFilter(filter, null);
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_reader_bookshelf shelf "
                        + "JOIN novel_book b ON b.id = shelf.book_id"
                        + filters.where(),
                Long.class,
                filters.parameters().toArray());
        return count == null ? 0 : count;
    }

    public List<TimedBookRow> findShelfAdds(AnalyticsFilter filter) {
        QueryParts filters = ownerFilter(filter, "shelf.added_at");
        return jdbc.query(
                "SELECT shelf.book_id, shelf.added_at FROM novel_reader_bookshelf shelf "
                        + "JOIN novel_book b ON b.id = shelf.book_id"
                        + filters.where(),
                (resultSet, rowNumber) -> new TimedBookRow(
                        resultSet.getLong("book_id"),
                        resultSet.getTimestamp("added_at").toInstant()),
                filters.parameters().toArray());
    }

    public List<BookCount> countCurrentFavoritesByBook(AnalyticsFilter filter) {
        QueryParts filters = ownerFilter(filter, null);
        return jdbc.query(
                "SELECT shelf.book_id, COUNT(*) AS item_count FROM novel_reader_bookshelf shelf "
                        + "JOIN novel_book b ON b.id = shelf.book_id"
                        + filters.where()
                        + " GROUP BY shelf.book_id",
                (resultSet, rowNumber) -> new BookCount(
                        resultSet.getLong("book_id"), resultSet.getLong("item_count")),
                filters.parameters().toArray());
    }

    /**
     * A purchase is included only when the entitlement's immutable source is PURCHASE and its
     * matching token debit exists. This rules out manually inserted or rolled-back partial rows.
     */
    public List<PurchaseRow> findSuccessfulPurchases(AnalyticsFilter filter) {
        QueryParts filters = ownerFilter(filter, "entitlement.acquired_at");
        return jdbc.query(
                "SELECT entitlement.book_id, entitlement.purchase_amount, entitlement.acquired_at "
                        + "FROM novel_book_entitlement entitlement "
                        + "JOIN novel_book b ON b.id = entitlement.book_id"
                        + filters.where()
                        + " AND entitlement.source_type = 'PURCHASE'"
                        + " AND EXISTS (SELECT 1 FROM novel_token_ledger ledger"
                        + " WHERE ledger.user_id = entitlement.user_id"
                        + " AND ledger.transaction_type = 'BOOK_PURCHASE'"
                        + " AND ledger.reference_type = 'BOOK'"
                        + " AND ledger.reference_id = CAST(entitlement.book_id AS CHAR)"
                        + " AND ledger.change_amount = -entitlement.purchase_amount)",
                (resultSet, rowNumber) -> new PurchaseRow(
                        resultSet.getLong("book_id"),
                        resultSet.getLong("purchase_amount"),
                        resultSet.getTimestamp("acquired_at").toInstant()),
                filters.parameters().toArray());
    }

    /**
     * The subscription ledger stores author and book ownership at redemption. The current catalog
     * join is still required, so a report can only ever expose a work that the requesting author
     * owns now; the snapshot predicate blocks malformed rows from crossing author boundaries.
     */
    public List<SubscriptionRow> findAuthorAttributedSubscriptions(AnalyticsFilter filter) {
        QueryParts filters = ownerFilter(filter, "subscription.occurred_at");
        return jdbc.query(
                "SELECT subscription.reader_user_id, subscription.book_id, subscription.membership_days, subscription.occurred_at "
                        + "FROM novel_author_subscription_ledger subscription "
                        + "JOIN novel_book b ON b.id = subscription.book_id"
                        + filters.where()
                        + " AND subscription.author_id = b.author_id",
                (resultSet, rowNumber) -> new SubscriptionRow(
                        resultSet.getLong("reader_user_id"),
                        resultSet.getLong("book_id"),
                        resultSet.getInt("membership_days"),
                        resultSet.getTimestamp("occurred_at").toInstant()),
                filters.parameters().toArray());
    }

    /**
     * Returns a bounded, immutable activity history for reader-work cohorts whose first event is
     * in the report window. Activity dates are already persisted in Asia/Shanghai by the writer,
     * avoiding database-session timezone conversion in both H2 and MySQL.
     */
    public List<RetentionActivityRow> findRetentionActivities(
            AnalyticsFilter filter, LocalDate observedThrough, LocalDate cohortFrom, LocalDate cohortTo) {
        QueryParts filters = ownerFilter(filter, null);
        List<Object> parameters = new ArrayList<>(filters.parameters());
        parameters.add(Date.valueOf(observedThrough));
        parameters.add(Date.valueOf(cohortFrom));
        parameters.add(Date.valueOf(cohortTo));
        return jdbc.query(
                "SELECT cohort.user_id, cohort.book_id, cohort.cohort_date, activity.activity_date "
                        + "FROM (SELECT activity.user_id, activity.book_id, MIN(activity.activity_date) AS cohort_date "
                        + "      FROM novel_reader_activity_event activity "
                        + "      JOIN novel_book b ON b.id = activity.book_id"
                        + filters.where()
                        + " AND activity.event_type = 'READING_PROGRESS' "
                        + "      GROUP BY activity.user_id, activity.book_id) cohort "
                        + "JOIN novel_reader_activity_event activity ON activity.user_id = cohort.user_id "
                        + " AND activity.book_id = cohort.book_id "
                        + " AND activity.event_type = 'READING_PROGRESS' "
                        + "WHERE activity.activity_date <= ? AND cohort.cohort_date >= ? AND cohort.cohort_date <= ? "
                        + "ORDER BY cohort.cohort_date ASC, cohort.book_id ASC, cohort.user_id ASC, activity.activity_date ASC",
                (resultSet, rowNumber) -> new RetentionActivityRow(
                        resultSet.getLong("user_id"),
                        resultSet.getLong("book_id"),
                        resultSet.getDate("cohort_date").toLocalDate(),
                        resultSet.getDate("activity_date").toLocalDate()),
                parameters.toArray());
    }

    /**
     * Progress is an overwrite-only reader state. This query intentionally selects only records
     * updated in the requested window and only where the saved chapter remains published.
     */
    public List<ProgressRow> findCurrentProgress(AnalyticsFilter filter) {
        QueryParts filters = ownerFilter(filter, "progress.updated_at");
        return jdbc.query(
                "SELECT progress.user_id, progress.book_id, progress.character_offset, progress.updated_at, "
                        + "CHAR_LENGTH(chapter.content) AS chapter_character_count, "
                        + "(SELECT COUNT(*) FROM novel_chapter earlier"
                        + " WHERE earlier.book_id = chapter.book_id"
                        + " AND earlier.published = TRUE AND earlier.status = 'PUBLISHED'"
                        + " AND (earlier.order_no < chapter.order_no"
                        + " OR (earlier.order_no = chapter.order_no AND earlier.id <= chapter.id))) AS chapter_position, "
                        + "(SELECT COUNT(*) FROM novel_chapter published_chapter"
                        + " WHERE published_chapter.book_id = chapter.book_id"
                        + " AND published_chapter.published = TRUE AND published_chapter.status = 'PUBLISHED') "
                        + " AS published_chapter_count "
                        + "FROM novel_reader_progress progress "
                        + "JOIN novel_book b ON b.id = progress.book_id "
                        + "JOIN novel_chapter chapter ON chapter.id = progress.chapter_id"
                        + " AND chapter.book_id = progress.book_id"
                        + " AND chapter.published = TRUE AND chapter.status = 'PUBLISHED'"
                        + filters.where(),
                (resultSet, rowNumber) -> new ProgressRow(
                        resultSet.getLong("user_id"),
                        resultSet.getLong("book_id"),
                        resultSet.getInt("character_offset"),
                        resultSet.getInt("chapter_character_count"),
                        resultSet.getLong("chapter_position"),
                        resultSet.getLong("published_chapter_count"),
                        resultSet.getTimestamp("updated_at").toInstant()),
                filters.parameters().toArray());
    }

    private static QueryParts ownedBooks(AnalyticsFilter filter) {
        StringBuilder where = new StringBuilder(" WHERE b.author_id = ?");
        List<Object> parameters = new ArrayList<>();
        parameters.add(filter.authorId());
        if (filter.bookId() != null) {
            where.append(" AND b.id = ?");
            parameters.add(filter.bookId());
        }
        return new QueryParts(where.toString(), List.copyOf(parameters));
    }

    private static QueryParts ownerFilter(AnalyticsFilter filter, String timeColumn) {
        StringBuilder where = new StringBuilder(" WHERE b.author_id = ?");
        List<Object> parameters = new ArrayList<>();
        parameters.add(filter.authorId());
        if (filter.bookId() != null) {
            where.append(" AND b.id = ?");
            parameters.add(filter.bookId());
        }
        if (timeColumn != null) {
            where.append(" AND ").append(timeColumn).append(" >= ? AND ").append(timeColumn).append(" < ?");
            parameters.add(Timestamp.from(filter.fromInclusive()));
            parameters.add(Timestamp.from(filter.toExclusive()));
        }
        return new QueryParts(where.toString(), List.copyOf(parameters));
    }

    public record AnalyticsFilter(long authorId, Long bookId, Instant fromInclusive, Instant toExclusive) {}

    public record BookRef(long id, String title) {}

    public record TimedBookRow(long bookId, Instant recordedAt) {}

    public record PurchaseRow(long bookId, long tokenAmount, Instant acquiredAt) {}

    public record SubscriptionRow(long readerUserId, long bookId, int membershipDays, Instant occurredAt) {}

    public record RetentionActivityRow(long userId, long bookId, LocalDate cohortDate, LocalDate activityDate) {}

    public record BookCount(long bookId, long count) {}

    public record ProgressRow(
            long userId,
            long bookId,
            int characterOffset,
            int chapterCharacterCount,
            long chapterPosition,
            long publishedChapterCount,
            Instant updatedAt) {}

    private record QueryParts(String where, List<Object> parameters) {}
}
