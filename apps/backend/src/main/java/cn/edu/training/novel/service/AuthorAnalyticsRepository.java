package cn.edu.training.novel.service;

import java.sql.Timestamp;
import java.time.Instant;
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
