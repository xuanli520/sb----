package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatusAudit;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterCandidateType;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.Volume;
import java.sql.Timestamp;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * JDBC read/write model for the catalog. It deliberately returns domain records rather than JDBC rows
 * so callers do not need to know the physical column names.
 */
@Repository
public class CatalogRepository {
    // `cover` is a historical physical column. Project a typed null so it cannot leak into a
    // runtime model while the media binding registry remains the sole cover source.
    private static final String BOOK_COLUMNS = "id, title, author_name, category, word_count, serial_status, synopsis, NULL AS cover, status, author_id, heat, purchase_price";
    private static final String CHAPTER_COLUMNS = "id, book_id, volume_id, title, content, published, status, scheduled_publish_at, published_at, review_reason, order_no";
    private static final String JOINED_CHAPTER_COLUMNS = "c.id, c.book_id, c.volume_id, c.title, c.content, c.published, c.status, c.scheduled_publish_at, c.published_at, c.review_reason, c.order_no";
    private static final String CHAPTER_CANDIDATE_COLUMNS = "id, book_id, target_chapter_id, volume_id, candidate_type, title, content, order_no, status, review_reason, moderation_audit_id, created_by_user_id, created_at, reviewed_by_user_id, reviewed_at";
    private static final RowMapper<Book> BOOK_MAPPER = (resultSet, rowNum) -> new Book(
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
    private static final RowMapper<BookStatusAudit> BOOK_STATUS_AUDIT_MAPPER = (resultSet, rowNum) ->
            new BookStatusAudit(
                    resultSet.getLong("id"),
                    resultSet.getLong("book_id"),
                    resultSet.getString("action"),
                    BookStatus.valueOf(resultSet.getString("previous_status")),
                    BookStatus.valueOf(resultSet.getString("status")),
                    resultSet.getString("reason"),
                    resultSet.getLong("operator_user_id"),
                    instant(resultSet.getTimestamp("created_at")));
    private static final RowMapper<Chapter> CHAPTER_MAPPER = (resultSet, rowNum) -> new Chapter(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getObject("volume_id", Long.class),
            resultSet.getString("title"),
            resultSet.getString("content"),
            resultSet.getBoolean("published"),
            ChapterStatus.valueOf(resultSet.getString("status")),
            instant(resultSet.getTimestamp("scheduled_publish_at")),
            instant(resultSet.getTimestamp("published_at")),
            resultSet.getString("review_reason"),
            resultSet.getInt("order_no"));
    private static final RowMapper<ChapterCandidate> CHAPTER_CANDIDATE_MAPPER = (resultSet, rowNum) -> new ChapterCandidate(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getLong("target_chapter_id"),
            resultSet.getObject("volume_id", Long.class),
            ChapterCandidateType.valueOf(resultSet.getString("candidate_type")),
            resultSet.getString("title"),
            resultSet.getString("content"),
            resultSet.getInt("order_no"),
            ChapterCandidateStatus.valueOf(resultSet.getString("status")),
            resultSet.getString("review_reason"),
            resultSet.getObject("moderation_audit_id", Long.class),
            resultSet.getLong("created_by_user_id"),
            instant(resultSet.getTimestamp("created_at")),
            resultSet.getObject("reviewed_by_user_id", Long.class),
            instant(resultSet.getTimestamp("reviewed_at")));
    private static final RowMapper<Volume> VOLUME_MAPPER = (resultSet, rowNum) -> new Volume(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getString("title"),
            resultSet.getInt("order_no"),
            instant(resultSet.getTimestamp("created_at")));

    private final JdbcTemplate jdbcTemplate;

    public CatalogRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Public catalog search uses parameter binding and an explicit LIKE escape character. A query
     * such as "%" is therefore searched as text instead of widening the result set.
     */
    public List<Book> findPublished(CatalogDiscoveryQuery criteria) {
        String term = criteria.query();
        StringBuilder sql = new StringBuilder("SELECT ").append(BOOK_COLUMNS).append(" FROM novel_book WHERE status = ?");
        List<Object> parameters = new ArrayList<>();
        parameters.add(BookStatus.PUBLISHED.name());
        if (!term.isEmpty()) {
            String pattern = fuzzyPattern(term);
            sql.append(" AND (LOWER(title) LIKE ? ESCAPE '!' OR LOWER(author_name) LIKE ? ESCAPE '!' OR LOWER(synopsis) LIKE ? ESCAPE '!')");
            parameters.add(pattern);
            parameters.add(pattern);
            parameters.add(pattern);
        }
        if (!criteria.category().isEmpty()) {
            sql.append(" AND category = ?");
            parameters.add(criteria.category());
        }
        if (!criteria.serialStatus().isEmpty()) {
            sql.append(" AND serial_status = ?");
            parameters.add(criteria.serialStatus());
        }
        if (criteria.minWords() != null) {
            sql.append(" AND word_count >= ?");
            parameters.add(criteria.minWords());
        }
        if (criteria.maxWords() != null) {
            sql.append(" AND word_count <= ?");
            parameters.add(criteria.maxWords());
        }
        sql.append(" ORDER BY heat DESC, id ASC");
        return jdbcTemplate.query(sql.toString(), BOOK_MAPPER, parameters.toArray());
    }

    /** Source compatibility for existing domain callers while discovery uses the richer query. */
    public List<Book> findPublished(String query, String category, String serialStatus) {
        return findPublished(new CatalogDiscoveryQuery(query, category, serialStatus, null, null));
    }

    public List<String> findPublishedCategories() {
        return jdbcTemplate.queryForList(
                "SELECT DISTINCT category FROM novel_book WHERE status = ? ORDER BY category ASC",
                String.class,
                BookStatus.PUBLISHED.name());
    }

    public List<String> findPublishedSerialStatuses() {
        return jdbcTemplate.queryForList(
                "SELECT DISTINCT serial_status FROM novel_book WHERE status = ? ORDER BY serial_status ASC",
                String.class,
                BookStatus.PUBLISHED.name());
    }

    public List<Book> findHot(int limit) {
        return jdbcTemplate.query(
                "SELECT " + BOOK_COLUMNS + " FROM novel_book WHERE status = ? ORDER BY heat DESC, id ASC LIMIT ?",
                BOOK_MAPPER,
                BookStatus.PUBLISHED.name(),
                limit);
    }

    public List<Book> findEditorRecommendations(int limit) {
        return jdbcTemplate.query(
                "SELECT " + BOOK_COLUMNS + " FROM novel_book "
                        + "WHERE status = ? AND editorial_rank IS NOT NULL "
                        + "ORDER BY editorial_rank ASC, id ASC LIMIT ?",
                BOOK_MAPPER,
                BookStatus.PUBLISHED.name(),
                limit);
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
                "SELECT " + CHAPTER_COLUMNS + " FROM novel_chapter WHERE book_id = ? AND published = ? AND status = ? ORDER BY order_no ASC, id ASC",
                CHAPTER_MAPPER,
                bookId,
                true,
                ChapterStatus.PUBLISHED.name());
    }

    public List<Chapter> findChaptersByBookId(long bookId) {
        return jdbcTemplate.query(
                "SELECT " + CHAPTER_COLUMNS + " FROM novel_chapter WHERE book_id = ? ORDER BY order_no ASC, id ASC",
                CHAPTER_MAPPER,
                bookId);
    }

    /**
     * Locks all of a book's chapters after its parent has been locked. This gives destructive
     * author operations the same lock ordering as scheduling and due publication.
     */
    public List<Chapter> findChaptersByBookIdForUpdate(long bookId) {
        return jdbcTemplate.query(
                "SELECT " + CHAPTER_COLUMNS + " FROM novel_chapter WHERE book_id = ? ORDER BY order_no ASC, id ASC FOR UPDATE",
                CHAPTER_MAPPER,
                bookId);
    }

    public Optional<Chapter> findChapterById(long chapterId) {
        List<Chapter> chapters = jdbcTemplate.query(
                "SELECT " + CHAPTER_COLUMNS + " FROM novel_chapter WHERE id = ?",
                CHAPTER_MAPPER,
                chapterId);
        return chapters.stream().findFirst();
    }

    /** Locks one chapter while the author changes its draft/schedule lifecycle. */
    public Optional<Chapter> findChapterByIdForUpdate(long chapterId) {
        List<Chapter> chapters = jdbcTemplate.query(
                "SELECT " + CHAPTER_COLUMNS + " FROM novel_chapter WHERE id = ? FOR UPDATE",
                CHAPTER_MAPPER,
                chapterId);
        return chapters.stream().findFirst();
    }

    public Optional<ChapterCandidate> findChapterCandidateById(long candidateId) {
        return jdbcTemplate.query(
                        "SELECT " + CHAPTER_CANDIDATE_COLUMNS + " FROM novel_chapter_candidate WHERE id = ?",
                        CHAPTER_CANDIDATE_MAPPER,
                        candidateId)
                .stream()
                .findFirst();
    }

    public Optional<ChapterCandidate> findChapterCandidateByIdForUpdate(long candidateId) {
        return jdbcTemplate.query(
                        "SELECT " + CHAPTER_CANDIDATE_COLUMNS + " FROM novel_chapter_candidate WHERE id = ? FOR UPDATE",
                        CHAPTER_CANDIDATE_MAPPER,
                        candidateId)
                .stream()
                .findFirst();
    }

    /** A chapter can have at most one active revision/candidate under the parent-book lock. */
    public Optional<ChapterCandidate> findPendingCandidateForTargetChapterForUpdate(long targetChapterId) {
        return jdbcTemplate.query(
                        "SELECT " + CHAPTER_CANDIDATE_COLUMNS + " FROM novel_chapter_candidate "
                                + "WHERE target_chapter_id = ? AND status = ? ORDER BY id DESC FOR UPDATE",
                        CHAPTER_CANDIDATE_MAPPER,
                        targetChapterId,
                        ChapterCandidateStatus.PENDING_REVIEW.name())
                .stream()
                .findFirst();
    }

    /** Returns current due candidates; callers lock parent book and chapter in that order. */
    public List<Chapter> findDueScheduledChaptersByAuthorId(long authorId, Instant dueAt) {
        return jdbcTemplate.query(
                "SELECT " + JOINED_CHAPTER_COLUMNS + " FROM novel_chapter c "
                        + "JOIN novel_book b ON b.id = c.book_id "
                        + "WHERE b.author_id = ? AND c.status = ? AND c.scheduled_publish_at <= ? "
                        + "ORDER BY c.scheduled_publish_at ASC, c.id ASC",
                CHAPTER_MAPPER,
                authorId,
                ChapterStatus.SCHEDULED.name(),
                Timestamp.from(dueAt));
    }

    /**
     * Returns all due candidates for the trusted background publisher. The service re-locks and
     * rechecks each row before changing its lifecycle, so concurrent author-triggered runs remain
     * idempotent.
     */
    public List<Chapter> findDueScheduledChapters(Instant dueAt) {
        return jdbcTemplate.query(
                "SELECT " + CHAPTER_COLUMNS + " FROM novel_chapter "
                        + "WHERE status = ? AND scheduled_publish_at <= ? "
                        + "ORDER BY scheduled_publish_at ASC, id ASC",
                CHAPTER_MAPPER,
                ChapterStatus.SCHEDULED.name(),
                Timestamp.from(dueAt));
    }

    public List<Volume> findVolumesByBookId(long bookId) {
        return jdbcTemplate.query(
                "SELECT id, book_id, title, order_no, created_at FROM novel_volume WHERE book_id = ? ORDER BY order_no ASC, id ASC",
                VOLUME_MAPPER,
                bookId);
    }

    /** Locks the complete ordered volume set after the caller has acquired the parent-book lock. */
    public List<Volume> findVolumesByBookIdForUpdate(long bookId) {
        return jdbcTemplate.query(
                "SELECT id, book_id, title, order_no, created_at FROM novel_volume "
                        + "WHERE book_id = ? ORDER BY order_no ASC, id ASC FOR UPDATE",
                VOLUME_MAPPER,
                bookId);
    }

    public Optional<Volume> findVolumeById(long volumeId) {
        List<Volume> volumes = jdbcTemplate.query(
                "SELECT id, book_id, title, order_no, created_at FROM novel_volume WHERE id = ?",
                VOLUME_MAPPER,
                volumeId);
        return volumes.stream().findFirst();
    }

    public Optional<Volume> findVolumeByIdForUpdate(long volumeId) {
        List<Volume> volumes = jdbcTemplate.query(
                "SELECT id, book_id, title, order_no, created_at FROM novel_volume WHERE id = ? FOR UPDATE",
                VOLUME_MAPPER,
                volumeId);
        return volumes.stream().findFirst();
    }

    /** Compatibility lookup for old fixtures that predate persisted author profiles. */
    public Optional<String> findAuthorNameByAuthorId(long authorId) {
        return Optional.ofNullable(jdbcTemplate.queryForObject(
                "SELECT MIN(author_name) FROM novel_book WHERE author_id = ?",
                String.class,
                authorId));
    }

    public BookStatusAudit recordBookStatusAudit(
            long bookId,
            String action,
            BookStatus previousStatus,
            BookStatus status,
            String reason,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_book_status_audit("
                            + "book_id, action, previous_status, status, reason, operator_user_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, bookId);
            statement.setString(2, action);
            statement.setString(3, previousStatus.name());
            statement.setString(4, status.name());
            statement.setString(5, reason);
            statement.setLong(6, operatorUserId);
            return statement;
        }, keyHolder);
        return findBookStatusAudit(generatedId(keyHolder, "book status audit"))
                .orElseThrow(() -> new IllegalStateException("book status audit was not saved"));
    }

    @Transactional
    public Book createBook(Book book) {
        long id = nextId("book");
        Book created = new Book(
                id,
                book.title(),
                book.author(),
                book.category(),
                book.words(),
                book.serialStatus(),
                book.synopsis(),
                null,
                book.status(),
                book.authorId(),
                book.heat(),
                book.purchasePrice());
        jdbcTemplate.update(
                "INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat, purchase_price, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                created.id(),
                created.title(),
                created.author(),
                created.category(),
                created.words(),
                created.serialStatus(),
                created.synopsis(),
                null,
                created.status().name(),
                created.authorId(),
                created.heat(),
                created.purchasePrice());
        return created;
    }

    @Transactional
    public Chapter createChapter(Chapter chapter) {
        long id = nextId("chapter");
        Chapter created = new Chapter(
                id,
                chapter.bookId(),
                chapter.volumeId(),
                chapter.title(),
                chapter.content(),
                chapter.published(),
                chapter.status(),
                chapter.scheduledPublishAt(),
                chapter.publishedAt(),
                chapter.reviewReason(),
                chapter.orderNo());
        jdbcTemplate.update(
                "INSERT INTO novel_chapter(id, book_id, volume_id, title, content, published, status, scheduled_publish_at, published_at, review_reason, order_no, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                created.id(),
                created.bookId(),
                created.volumeId(),
                created.title(),
                created.content(),
                created.published(),
                created.status().name(),
                timestamp(created.scheduledPublishAt()),
                timestamp(created.publishedAt()),
                created.reviewReason(),
                created.orderNo());
        // Read back the JDBC value so timestamp precision is identical to subsequent reads.
        return findChapterById(id).orElseThrow(() -> new IllegalStateException("chapter was not created"));
    }

    public Chapter updateChapter(Chapter chapter) {
        int updated = jdbcTemplate.update(
                "UPDATE novel_chapter SET volume_id = ?, title = ?, content = ?, published = ?, status = ?, scheduled_publish_at = ?, published_at = ?, review_reason = ?, order_no = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                chapter.volumeId(),
                chapter.title(),
                chapter.content(),
                chapter.published(),
                chapter.status().name(),
                timestamp(chapter.scheduledPublishAt()),
                timestamp(chapter.publishedAt()),
                chapter.reviewReason(),
                chapter.orderNo(),
                chapter.id());
        if (updated == 0) {
            throw new IllegalStateException("chapter not found");
        }
        // Keep timestamp precision and any JDBC coercion identical to subsequent reads. In
        // particular, publication timestamps are persisted with database precision rather than
        // the caller's in-memory Instant precision.
        return findChapterById(chapter.id()).orElseThrow(() -> new IllegalStateException("chapter not found"));
    }

    /** Creates a durable candidate before contacting a moderation provider. */
    public ChapterCandidate createChapterCandidate(ChapterCandidate candidate) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_chapter_candidate("
                            + "book_id, target_chapter_id, volume_id, candidate_type, title, content, order_no, status, "
                            + "review_reason, moderation_audit_id, created_by_user_id, created_at, reviewed_by_user_id, reviewed_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, candidate.bookId());
            statement.setLong(2, candidate.targetChapterId());
            if (candidate.volumeId() == null) {
                statement.setObject(3, null);
            } else {
                statement.setLong(3, candidate.volumeId());
            }
            statement.setString(4, candidate.type().name());
            statement.setString(5, candidate.title());
            statement.setString(6, candidate.content());
            statement.setInt(7, candidate.orderNo());
            statement.setString(8, candidate.status().name());
            statement.setString(9, candidate.reviewReason());
            if (candidate.moderationAuditId() == null) {
                statement.setObject(10, null);
            } else {
                statement.setLong(10, candidate.moderationAuditId());
            }
            statement.setLong(11, candidate.createdByUserId());
            if (candidate.reviewedByUserId() == null) {
                statement.setObject(12, null);
            } else {
                statement.setLong(12, candidate.reviewedByUserId());
            }
            statement.setTimestamp(13, timestamp(candidate.reviewedAt()));
            return statement;
        }, keyHolder);
        long id = generatedId(keyHolder, "chapter candidate");
        return findChapterCandidateById(id).orElseThrow(() -> new IllegalStateException("chapter candidate was not created"));
    }

    public ChapterCandidate updateChapterCandidate(ChapterCandidate candidate) {
        int updated = jdbcTemplate.update(
                "UPDATE novel_chapter_candidate SET volume_id = ?, title = ?, content = ?, order_no = ?, status = ?, "
                        + "review_reason = ?, moderation_audit_id = ?, reviewed_by_user_id = ?, reviewed_at = ? WHERE id = ?",
                candidate.volumeId(),
                candidate.title(),
                candidate.content(),
                candidate.orderNo(),
                candidate.status().name(),
                candidate.reviewReason(),
                candidate.moderationAuditId(),
                candidate.reviewedByUserId(),
                timestamp(candidate.reviewedAt()),
                candidate.id());
        if (updated == 0) {
            throw new IllegalStateException("chapter candidate not found");
        }
        return findChapterCandidateById(candidate.id())
                .orElseThrow(() -> new IllegalStateException("chapter candidate not found"));
    }

    public void deleteChapter(long chapterId) {
        int deleted = jdbcTemplate.update("DELETE FROM novel_chapter WHERE id = ?", chapterId);
        if (deleted == 0) {
            throw new IllegalStateException("chapter not found");
        }
    }

    @Transactional
    public Volume createVolume(long bookId, String title, int orderNo) {
        long id = nextId("volume");
        jdbcTemplate.update(
                "INSERT INTO novel_volume(id, book_id, title, order_no, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                id,
                bookId,
                title,
                orderNo);
        return findVolumeById(id).orElseThrow(() -> new IllegalStateException("volume was not created"));
    }

    public Volume updateVolumeTitle(long volumeId, String title) {
        int updated = jdbcTemplate.update(
                "UPDATE novel_volume SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                title,
                volumeId);
        if (updated == 0) {
            throw new IllegalStateException("volume not found");
        }
        return findVolumeById(volumeId).orElseThrow(() -> new IllegalStateException("volume not found"));
    }

    /** Temporarily moves every order away from the positive user-visible range before a rewrite. */
    public void parkVolumeOrders(long bookId) {
        jdbcTemplate.update("UPDATE novel_volume SET order_no = -order_no WHERE book_id = ?", bookId);
    }

    /** Writes a fully normalized, contiguous order after {@link #parkVolumeOrders(long)}. */
    public void writeVolumeOrders(List<Volume> orderedVolumes) {
        for (Volume volume : orderedVolumes) {
            int updated = jdbcTemplate.update(
                    "UPDATE novel_volume SET order_no = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    volume.orderNo(),
                    volume.id());
            if (updated == 0) {
                throw new IllegalStateException("volume not found");
            }
        }
    }

    /** Retains chapters and their publication lifecycle when their organizational parent is removed. */
    public int detachVolumeChapters(long volumeId) {
        int detached = jdbcTemplate.update(
                "UPDATE novel_chapter SET volume_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE volume_id = ?",
                volumeId);
        jdbcTemplate.update(
                "UPDATE novel_chapter_candidate SET volume_id = NULL WHERE volume_id = ?",
                volumeId);
        return detached;
    }

    public void deleteVolume(long volumeId) {
        int deleted = jdbcTemplate.update("DELETE FROM novel_volume WHERE id = ?", volumeId);
        if (deleted == 0) {
            throw new IllegalStateException("volume not found");
        }
    }

    public Book updateBook(Book book) {
        int updated = jdbcTemplate.update(
                "UPDATE novel_book SET title = ?, author_name = ?, category = ?, word_count = ?, serial_status = ?, synopsis = ?, cover = ?, status = ?, author_id = ?, heat = ?, purchase_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                book.title(),
                book.author(),
                book.category(),
                book.words(),
                book.serialStatus(),
                book.synopsis(),
                null,
                book.status().name(),
                book.authorId(),
                book.heat(),
                book.purchasePrice(),
                book.id());
        if (updated == 0) {
            throw new IllegalStateException("book not found");
        }
        return book;
    }

    /**
     * A draft book normally cannot have reader activity, but a defensive check keeps a direct
     * database import or administrative redemption code from producing dangling references when
     * an author removes a work.
     */
    public boolean hasExternalBookReferences(long bookId) {
        return hasRows("novel_redemption_code", "book_id", bookId)
                || hasRows("novel_book_entitlement", "book_id", bookId)
                || hasRows("novel_reward_record", "book_id", bookId)
                || hasRows("novel_reader_bookshelf", "book_id", bookId)
                || hasRows("novel_reader_favorite_event", "book_id", bookId)
                || hasRows("novel_book_subscription", "book_id", bookId)
                || hasRows("novel_book_subscription_event", "book_id", bookId)
                || hasRows("novel_reader_progress", "book_id", bookId)
                || hasRows("novel_reader_bookmark", "book_id", bookId)
                || hasRows("novel_paragraph_annotation", "book_id", bookId)
                || hasRows("novel_comment", "book_id", bookId)
                || hasRows("novel_book_rating", "book_id", bookId)
                || hasRows("novel_book_vote", "book_id", bookId)
                || hasRows("novel_book_interaction_stat", "book_id", bookId);
    }

    /** The same invariant is checked before deleting an otherwise non-public chapter. */
    public boolean hasExternalChapterReferences(long chapterId) {
        return hasRows("novel_reader_progress", "chapter_id", chapterId)
                || hasRows("novel_reader_bookmark", "chapter_id", chapterId)
                || hasRows("novel_paragraph_annotation", "chapter_id", chapterId)
                || hasRows("novel_comment", "chapter_id", chapterId);
    }

    /** Caller must first lock and validate the book and its child chapter states. */
    public void deleteBookTree(long bookId) {
        jdbcTemplate.update("DELETE FROM novel_chapter_candidate WHERE book_id = ?", bookId);
        jdbcTemplate.update("DELETE FROM novel_chapter WHERE book_id = ?", bookId);
        jdbcTemplate.update("DELETE FROM novel_volume WHERE book_id = ?", bookId);
        int deleted = jdbcTemplate.update("DELETE FROM novel_book WHERE id = ?", bookId);
        if (deleted == 0) {
            throw new IllegalStateException("book not found");
        }
    }

    public int nextChapterOrder(long bookId) {
        Integer highestOrder = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(order_no), 0) FROM novel_chapter WHERE book_id = ?",
                Integer.class,
                bookId);
        return highestOrder + 1;
    }

    public int nextVolumeOrder(long bookId) {
        Integer highestOrder = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(order_no), 0) FROM novel_volume WHERE book_id = ?",
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

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static String fuzzyPattern(String term) {
        String normalized = term.toLowerCase(Locale.ROOT)
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return "%" + normalized + "%";
    }

    private boolean hasRows(String table, String column, long id) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM " + table + " WHERE " + column + " = ?",
                Long.class,
                id);
        return count != null && count > 0;
    }

    private Optional<BookStatusAudit> findBookStatusAudit(long auditId) {
        return jdbcTemplate.query(
                        "SELECT id, book_id, action, previous_status, status, reason, operator_user_id, created_at "
                                + "FROM novel_book_status_audit WHERE id = ?",
                        BOOK_STATUS_AUDIT_MAPPER,
                        auditId)
                .stream()
                .findFirst();
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
