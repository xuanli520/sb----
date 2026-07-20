package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * JDBC read/write model for the catalog. It deliberately returns domain records rather than JDBC rows
 * so callers do not need to know the physical column names.
 */
@Repository
public class CatalogRepository {
    private static final String BOOK_COLUMNS = "id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat";
    private static final RowMapper<Book> BOOK_MAPPER = (resultSet, rowNum) -> new Book(
            resultSet.getLong("id"),
            resultSet.getString("title"),
            resultSet.getString("author_name"),
            resultSet.getString("category"),
            resultSet.getInt("word_count"),
            resultSet.getString("serial_status"),
            resultSet.getString("synopsis"),
            resultSet.getString("cover"),
            BookStatus.valueOf(resultSet.getString("status")),
            resultSet.getLong("author_id"),
            resultSet.getLong("heat"));
    private static final RowMapper<Chapter> CHAPTER_MAPPER = (resultSet, rowNum) -> new Chapter(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getString("title"),
            resultSet.getString("content"),
            resultSet.getBoolean("published"),
            resultSet.getInt("order_no"));

    private final JdbcTemplate jdbcTemplate;

    public CatalogRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Book> findPublished(String query, String category, String serialStatus) {
        String term = query == null ? "" : query.trim();
        StringBuilder sql = new StringBuilder("SELECT ").append(BOOK_COLUMNS).append(" FROM novel_book WHERE status = ?");
        List<Object> parameters = new ArrayList<>();
        parameters.add(BookStatus.PUBLISHED.name());
        if (!term.isEmpty()) {
            String pattern = "%" + term.toLowerCase(Locale.ROOT) + "%";
            sql.append(" AND (LOWER(title) LIKE ? OR LOWER(author_name) LIKE ? OR LOWER(synopsis) LIKE ?)");
            parameters.add(pattern);
            parameters.add(pattern);
            parameters.add(pattern);
        }
        if (category != null && !category.isBlank()) {
            sql.append(" AND category = ?");
            parameters.add(category);
        }
        if (serialStatus != null && !serialStatus.isBlank()) {
            sql.append(" AND serial_status = ?");
            parameters.add(serialStatus);
        }
        sql.append(" ORDER BY heat DESC, id ASC");
        return jdbcTemplate.query(sql.toString(), BOOK_MAPPER, parameters.toArray());
    }

    public Optional<Book> findById(long id) {
        List<Book> books = jdbcTemplate.query("SELECT " + BOOK_COLUMNS + " FROM novel_book WHERE id = ?", BOOK_MAPPER, id);
        return books.stream().findFirst();
    }

    /** Locks the catalog row while a chapter and its parent state are changed in one transaction. */
    public Optional<Book> findByIdForUpdate(long id) {
        List<Book> books = jdbcTemplate.query("SELECT " + BOOK_COLUMNS + " FROM novel_book WHERE id = ? FOR UPDATE", BOOK_MAPPER, id);
        return books.stream().findFirst();
    }

    public List<Chapter> findPublishedChaptersByBookId(long bookId) {
        return jdbcTemplate.query(
                "SELECT id, book_id, title, content, published, order_no FROM novel_chapter WHERE book_id = ? AND published = ? ORDER BY order_no ASC, id ASC",
                CHAPTER_MAPPER,
                bookId,
                true);
    }

    public List<Chapter> findChaptersByBookId(long bookId) {
        return jdbcTemplate.query(
                "SELECT id, book_id, title, content, published, order_no FROM novel_chapter WHERE book_id = ? ORDER BY order_no ASC, id ASC",
                CHAPTER_MAPPER,
                bookId);
    }

    public List<Book> findByAuthorId(long authorId) {
        return jdbcTemplate.query(
                "SELECT " + BOOK_COLUMNS + " FROM novel_book WHERE author_id = ? ORDER BY id ASC",
                BOOK_MAPPER,
                authorId);
    }

    public List<Book> findPendingReview() {
        return jdbcTemplate.query(
                "SELECT " + BOOK_COLUMNS + " FROM novel_book WHERE status IN (?, ?) ORDER BY id ASC",
                BOOK_MAPPER,
                BookStatus.PENDING_REVIEW.name(),
                BookStatus.NEEDS_REVIEW.name());
    }

    @Transactional
    public Book createBook(Book book) {
        long id = nextId("book");
        Book created = new Book(id, book.title(), book.author(), book.category(), book.words(), book.serialStatus(), book.synopsis(), book.cover(), book.status(), book.authorId(), book.heat());
        jdbcTemplate.update(
                "INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                created.id(),
                created.title(),
                created.author(),
                created.category(),
                created.words(),
                created.serialStatus(),
                created.synopsis(),
                created.cover(),
                created.status().name(),
                created.authorId(),
                created.heat());
        return created;
    }

    @Transactional
    public Chapter createChapter(Chapter chapter) {
        long id = nextId("chapter");
        Chapter created = new Chapter(id, chapter.bookId(), chapter.title(), chapter.content(), chapter.published(), chapter.orderNo());
        jdbcTemplate.update(
                "INSERT INTO novel_chapter(id, book_id, title, content, published, order_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                created.id(),
                created.bookId(),
                created.title(),
                created.content(),
                created.published(),
                created.orderNo());
        return created;
    }

    public Book updateBook(Book book) {
        int updated = jdbcTemplate.update(
                "UPDATE novel_book SET title = ?, author_name = ?, category = ?, word_count = ?, serial_status = ?, synopsis = ?, cover = ?, status = ?, author_id = ?, heat = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                book.title(),
                book.author(),
                book.category(),
                book.words(),
                book.serialStatus(),
                book.synopsis(),
                book.cover(),
                book.status().name(),
                book.authorId(),
                book.heat(),
                book.id());
        if (updated == 0) {
            throw new IllegalStateException("book not found");
        }
        return book;
    }

    public int nextChapterOrder(long bookId) {
        Integer highestOrder = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(order_no), 0) FROM novel_chapter WHERE book_id = ?",
                Integer.class,
                bookId);
        return highestOrder + 1;
    }

    @Transactional
    protected long nextId(String sequenceName) {
        Long nextValue = jdbcTemplate.queryForObject(
                "SELECT next_value FROM novel_catalog_sequence WHERE sequence_name = ? FOR UPDATE",
                Long.class,
                sequenceName);
        if (nextValue == null) {
            throw new IllegalStateException("missing catalog sequence: " + sequenceName);
        }
        jdbcTemplate.update(
                "UPDATE novel_catalog_sequence SET next_value = ? WHERE sequence_name = ?",
                Math.addExact(nextValue, 1L),
                sequenceName);
        return nextValue;
    }
}
