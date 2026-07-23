package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Comment;
import cn.edu.training.novel.domain.CommentPage;
import cn.edu.training.novel.domain.AuthorModerationAdvice;
import cn.edu.training.novel.domain.InteractionStats;
import cn.edu.training.novel.domain.ParagraphAnnotation;
import cn.edu.training.novel.domain.ParagraphAnnotationPage;
import cn.edu.training.novel.mapper.InteractionPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * JDBC persistence for comments, ratings and votes. Mutations participate in the service
 * transaction so the interaction row and its durable book-level counters cannot diverge.
 */
@Repository
public class InteractionRepository {
    public static final String PRIVATE = "PRIVATE";
    public static final String PENDING_REVIEW = "PENDING_REVIEW";
    public static final String VISIBLE = "VISIBLE";
    public static final String REJECTED = "REJECTED";
    private static final int MAX_PAGE_SIZE = 100;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    private static final RowMapper<Comment> COMMENT_MAPPER = (resultSet, rowNumber) -> new Comment(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            nullableLong(resultSet.getObject("chapter_id")),
            resultSet.getLong("user_id"),
            resultSet.getString("author_name"),
            resultSet.getString("content"),
            resultSet.getString("status"),
            instant(resultSet.getTimestamp("created_at")),
            null);
    private static final RowMapper<ParagraphAnnotation> PARAGRAPH_ANNOTATION_MAPPER = (resultSet, rowNumber) -> new ParagraphAnnotation(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getLong("chapter_id"),
            resultSet.getLong("user_id"),
            resultSet.getString("author_name"),
            resultSet.getInt("paragraph_index"),
            resultSet.getInt("selection_start"),
            resultSet.getInt("selection_end"),
            resultSet.getString("selected_text"),
            resultSet.getString("note"),
            resultSet.getBoolean("share_intent"),
            resultSet.getString("status"),
            instant(resultSet.getTimestamp("created_at")),
            null);

    private final JdbcTemplate jdbc;
    private final InteractionPageMapper pageMapper;

    public InteractionRepository(JdbcTemplate jdbc, InteractionPageMapper pageMapper) {
        this.jdbc = jdbc;
        this.pageMapper = pageMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Comment createComment(
            long bookId,
            Long chapterId,
            long userId,
            String authorName,
            String content,
            String status) {
        String normalizedStatus = normalizeCommentStatus(status);
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_comment(book_id, chapter_id, user_id, author_name, content, status, created_at, updated_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, bookId);
            if (chapterId == null) {
                statement.setNull(2, java.sql.Types.BIGINT);
            } else {
                statement.setLong(2, chapterId);
            }
            statement.setLong(3, userId);
            statement.setString(4, authorName);
            statement.setString(5, content);
            statement.setString(6, normalizedStatus);
            return statement;
        }, keyHolder);
        long id = generatedId(keyHolder, "comment");
        if (VISIBLE.equals(normalizedStatus)) {
            incrementVisibleCommentCount(bookId, 1);
        }
        return findCommentById(id).orElseThrow(() -> new IllegalStateException("comment was not saved"));
    }

    /** A review may only move a queued comment into its final visible or rejected state. */
    @Transactional(propagation = Propagation.MANDATORY)
    public Comment reviewComment(long commentId, long reviewerUserId, boolean approve, String reason) {
        Comment existing = lockComment(commentId);
        if (!PENDING_REVIEW.equals(existing.status())) {
            throw new IllegalStateException("comment is not awaiting review");
        }
        String status = approve ? VISIBLE : REJECTED;
        int changed = jdbc.update(
                "UPDATE novel_comment SET status = ?, review_reason = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, "
                        + "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?",
                status,
                reason == null ? "" : reason,
                reviewerUserId,
                commentId,
                PENDING_REVIEW);
        if (changed != 1) {
            throw new IllegalStateException("comment review was not applied");
        }
        if (approve) {
            incrementVisibleCommentCount(existing.bookId(), 1);
        }
        return findCommentById(commentId).orElseThrow(() -> new IllegalStateException("comment review was not saved"));
    }

    /**
     * Persists a server-validated chapter slice.  The caller owns the source-text validation; this
     * repository owns the durable sharing status and makes the row part of the enclosing service
     * transaction with its audit event.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public ParagraphAnnotation createParagraphAnnotation(
            long bookId,
            long chapterId,
            long userId,
            String authorName,
            int paragraphIndex,
            int selectionStart,
            int selectionEnd,
            String selectedText,
            String note,
            boolean shareIntent,
            String status) {
        String normalizedStatus = normalizeAnnotationStatus(status);
        if ((shareIntent && !PENDING_REVIEW.equals(normalizedStatus))
                || (!shareIntent && !PRIVATE.equals(normalizedStatus))) {
            throw new IllegalArgumentException("annotation status does not match share intent");
        }
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_paragraph_annotation(book_id, chapter_id, user_id, author_name, paragraph_index, "
                            + "selection_start, selection_end, selected_text, note, share_intent, status, created_at, updated_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, bookId);
            statement.setLong(2, chapterId);
            statement.setLong(3, userId);
            statement.setString(4, authorName);
            statement.setInt(5, paragraphIndex);
            statement.setInt(6, selectionStart);
            statement.setInt(7, selectionEnd);
            statement.setString(8, selectedText);
            statement.setString(9, note);
            statement.setBoolean(10, shareIntent);
            statement.setString(11, normalizedStatus);
            return statement;
        }, keyHolder);
        long id = generatedId(keyHolder, "paragraph annotation");
        return findParagraphAnnotationById(id)
                .orElseThrow(() -> new IllegalStateException("paragraph annotation was not saved"));
    }

    /** Only requested public shares can move from the review queue into a visible state. */
    @Transactional(propagation = Propagation.MANDATORY)
    public ParagraphAnnotation reviewParagraphAnnotation(
            long annotationId, long reviewerUserId, boolean approve, String reason) {
        ParagraphAnnotation existing = lockParagraphAnnotation(annotationId);
        if (!existing.shareIntent() || !PENDING_REVIEW.equals(existing.status())) {
            throw new IllegalStateException("paragraph annotation is not awaiting review");
        }
        String status = approve ? VISIBLE : REJECTED;
        int changed = jdbc.update(
                "UPDATE novel_paragraph_annotation SET status = ?, review_reason = ?, reviewed_by_user_id = ?, "
                        + "reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND status = ? AND share_intent = ?",
                status,
                reason == null ? "" : reason,
                reviewerUserId,
                annotationId,
                PENDING_REVIEW,
                true);
        if (changed != 1) {
            throw new IllegalStateException("paragraph annotation review was not applied");
        }
        return findParagraphAnnotationById(annotationId)
                .orElseThrow(() -> new IllegalStateException("paragraph annotation review was not saved"));
    }

    /**
     * Records a book owner's recommendation without changing the pending interaction state. The
     * source row lock serializes this advice with the administrator's final review.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public AuthorModerationAdvice adviseOnComment(
            long authorUserId,
            long bookId,
            long commentId,
            boolean recommendVisible,
            String reason) {
        Comment comment = lockComment(commentId);
        requirePendingOwnedInteraction(comment.bookId(), bookId, comment.status(), "comment");
        return upsertCommentAdvice(authorUserId, bookId, commentId, recommendation(recommendVisible), reason);
    }

    /** See {@link #adviseOnComment(long, long, long, boolean, String)}. */
    @Transactional(propagation = Propagation.MANDATORY)
    public AuthorModerationAdvice adviseOnParagraphAnnotation(
            long authorUserId,
            long bookId,
            long annotationId,
            boolean recommendVisible,
            String reason) {
        ParagraphAnnotation annotation = lockParagraphAnnotation(annotationId);
        if (!annotation.shareIntent()) {
            throw new java.util.NoSuchElementException("paragraph annotation is not a shared review item");
        }
        requirePendingOwnedInteraction(annotation.bookId(), bookId, annotation.status(), "paragraph annotation");
        return upsertParagraphAnnotationAdvice(
                authorUserId,
                bookId,
                annotationId,
                recommendation(recommendVisible),
                reason);
    }

    /** Upserts one reader's rating and updates the precomputed count/total under the book lock. */
    @Transactional(propagation = Propagation.MANDATORY)
    public double rate(long userId, long bookId, int rating) {
        if (rating < 1 || rating > 5) {
            throw new IllegalArgumentException("rating must be between 1 and 5");
        }
        MutableStats stats = lockStats(bookId);
        List<Integer> previousValues = jdbc.query(
                "SELECT rating FROM novel_book_rating WHERE book_id = ? AND user_id = ?",
                (resultSet, rowNumber) -> resultSet.getInt(1),
                bookId,
                userId);
        long nextCount = stats.ratingCount();
        long nextTotal;
        if (previousValues.isEmpty()) {
            jdbc.update(
                    "INSERT INTO novel_book_rating(book_id, user_id, rating, created_at, updated_at) "
                            + "VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    bookId,
                    userId,
                    rating);
            nextCount++;
            nextTotal = Math.addExact(stats.ratingTotal(), rating);
        } else {
            int previous = previousValues.getFirst();
            jdbc.update(
                    "UPDATE novel_book_rating SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE book_id = ? AND user_id = ?",
                    rating,
                    bookId,
                    userId);
            nextTotal = Math.addExact(stats.ratingTotal(), rating - previous);
        }
        updateRatingStats(bookId, nextCount, nextTotal);
        return average(nextTotal, nextCount);
    }

    /**
     * The existing book-vote primary key remains the durable per-book idempotency boundary. The
     * user/window row serializes quota consumption, so concurrent reader requests cannot both fit
     * into the final configured slot.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public VoteReceipt recordVote(long userId, long bookId, String voteType, int quotaLimit) {
        String type = requireVoteType(voteType);
        if (quotaLimit < 0) {
            throw new IllegalArgumentException("vote quota cannot be negative");
        }
        LocalDate windowStart = voteWindowStart(type, LocalDate.now(BUSINESS_ZONE));
        int usedBefore = lockVoteQuota(userId, type, windowStart);
        if (usedBefore >= quotaLimit) {
            throw new IllegalStateException(voteQuotaExceededMessage(type));
        }
        MutableStats stats = lockStats(bookId);
        try {
            jdbc.update(
                    "INSERT INTO novel_book_vote(book_id, user_id, vote_type, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                    bookId,
                    userId,
                    type);
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException("already voted for this book");
        }
        int quotaChanged = jdbc.update(
                "UPDATE novel_vote_quota_usage SET used_count = used_count + 1, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE user_id = ? AND vote_type = ? AND window_start = ? AND used_count = ?",
                userId,
                type,
                Date.valueOf(windowStart),
                usedBefore);
        if (quotaChanged != 1) {
            throw new IllegalStateException("vote quota was not recorded");
        }
        long nextCount;
        if ("recommendation".equals(type)) {
            jdbc.update(
                    "UPDATE novel_book_interaction_stat SET recommendation_vote_count = recommendation_vote_count + 1, "
                            + "updated_at = CURRENT_TIMESTAMP WHERE book_id = ?",
                    bookId);
            nextCount = stats.recommendationVoteCount() + 1;
        } else {
            jdbc.update(
                    "UPDATE novel_book_interaction_stat SET monthly_vote_count = monthly_vote_count + 1, "
                            + "updated_at = CURRENT_TIMESTAMP WHERE book_id = ?",
                    bookId);
            nextCount = stats.monthlyVoteCount() + 1;
        }
        return new VoteReceipt(type, nextCount, quotaLimit - usedBefore - 1, quotaLimit);
    }

    public List<Comment> findVisibleComments(long bookId) {
        return jdbc.query(
                "SELECT id, book_id, chapter_id, user_id, author_name, content, status, created_at FROM novel_comment "
                        + "WHERE book_id = ? AND status = ? ORDER BY created_at ASC, id ASC",
                COMMENT_MAPPER,
                bookId,
                VISIBLE);
    }

    public CommentPage findPublicComments(long bookId, Long chapterId, int page, int size) {
        return findComments(bookId, chapterId, VISIBLE, null, false, page, size);
    }

    /**
     * The no-chapter public view is intentionally limited to book-level discussion.  Chapter
     * comments must go through a chapter-specific access decision in NovelStore.
     */
    public CommentPage findPublicBookLevelComments(long bookId, int page, int size) {
        return pageComments(bookId, null, VISIBLE, null, true, false, page, size);
    }

    public CommentPage findCommentsForBook(long bookId, String status, int page, int size) {
        return findComments(bookId, null, optionalCommentStatus(status), null, true, page, size);
    }

    public CommentPage findCommentsForUser(long userId, String status, int page, int size) {
        return findComments(null, null, optionalCommentStatus(status), userId, false, page, size);
    }

    public CommentPage findCommentsByStatus(String status, int page, int size) {
        String requiredStatus = optionalCommentStatus(status);
        return findComments(null, null, requiredStatus, null, true, page, size);
    }

    /** Public reads join the current catalog state, closing the publication-state race at query time. */
    public ParagraphAnnotationPage findPublicParagraphAnnotations(long bookId, long chapterId, int page, int size) {
        return findParagraphAnnotations(
                bookId,
                chapterId,
                VISIBLE,
                null,
                true,
                true,
                false,
                page,
                size);
    }

    /** A reader's own highlights remain hidden whenever their source chapter is no longer public. */
    public ParagraphAnnotationPage findParagraphAnnotationsForUser(
            long userId, Long bookId, Long chapterId, String status, int page, int size) {
        return findParagraphAnnotations(
                bookId,
                chapterId,
                optionalAnnotationStatus(status),
                userId,
                null,
                true,
                false,
                page,
                size);
    }

    /** The author scope is checked by the service; private reader notes never leave their owner scope. */
    public ParagraphAnnotationPage findParagraphAnnotationsForBook(
            long bookId, String status, int page, int size) {
        return findParagraphAnnotations(
                bookId,
                null,
                optionalAnnotationStatus(status),
                null,
                true,
                false,
                true,
                page,
                size);
    }

    public ParagraphAnnotationPage findParagraphAnnotationsByStatus(String status, int page, int size) {
        return findParagraphAnnotations(
                null,
                null,
                optionalAnnotationStatus(status),
                null,
                true,
                false,
                true,
                page,
                size);
    }

    public Optional<ParagraphAnnotation> findParagraphAnnotationById(long annotationId) {
        List<ParagraphAnnotation> annotations = jdbc.query(
                "SELECT id, book_id, chapter_id, user_id, author_name, paragraph_index, selection_start, selection_end, "
                        + "selected_text, note, share_intent, status, created_at "
                        + "FROM novel_paragraph_annotation WHERE id = ?",
                PARAGRAPH_ANNOTATION_MAPPER,
                annotationId);
        return annotations.stream().findFirst();
    }

    public Optional<Comment> findCommentById(long commentId) {
        List<Comment> comments = jdbc.query(
                "SELECT id, book_id, chapter_id, user_id, author_name, content, status, created_at FROM novel_comment WHERE id = ?",
                COMMENT_MAPPER,
                commentId);
        return comments.stream().findFirst();
    }

    public InteractionStats stats(long bookId) {
        List<MutableStats> rows = jdbc.query(
                "SELECT visible_comment_count, rating_count, rating_total, recommendation_vote_count, monthly_vote_count "
                        + "FROM novel_book_interaction_stat WHERE book_id = ?",
                STATS_MAPPER,
                bookId);
        if (rows.isEmpty()) {
            return new InteractionStats(0, 0, 0, 0, 0);
        }
        return rows.getFirst().toPublic();
    }

    /** Loads all requested aggregate rows in one query for catalog and author projections. */
    public Map<Long, InteractionStats> statsByBookIds(Collection<Long> bookIds) {
        List<Long> ids = bookIds.stream().filter(id -> id != null && id > 0).distinct().toList();
        if (ids.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        List<StatRow> rows = jdbc.query(
                "SELECT book_id, visible_comment_count, rating_count, rating_total, recommendation_vote_count, monthly_vote_count "
                        + "FROM novel_book_interaction_stat WHERE book_id IN (" + placeholders + ")",
                (resultSet, rowNumber) -> new StatRow(resultSet.getLong("book_id"), new MutableStats(
                        resultSet.getLong("visible_comment_count"),
                        resultSet.getLong("rating_count"),
                        resultSet.getLong("rating_total"),
                        resultSet.getLong("recommendation_vote_count"),
                        resultSet.getLong("monthly_vote_count")).toPublic()),
                ids.toArray());
        Map<Long, InteractionStats> result = new LinkedHashMap<>();
        for (StatRow row : rows) result.put(row.bookId(), row.stats());
        return Map.copyOf(result);
    }

    /** Nullable because a reader may not have rated the work yet. */
    public Integer ratingForUser(long userId, long bookId) {
        List<Integer> ratings = jdbc.query(
                "SELECT rating FROM novel_book_rating WHERE user_id = ? AND book_id = ?",
                (resultSet, rowNumber) -> resultSet.getInt("rating"),
                userId,
                bookId);
        return ratings.isEmpty() ? null : ratings.getFirst();
    }

    private record StatRow(long bookId, InteractionStats stats) { }

    private CommentPage findComments(
            Long bookId,
            Long chapterId,
            String status,
            Long userId,
            boolean includeAuthorAdvice,
            int page,
            int size) {
        return pageComments(bookId, chapterId, status, userId, false, includeAuthorAdvice, page, size);
    }

    private CommentPage pageComments(
            Long bookId,
            Long chapterId,
            String status,
            Long userId,
            boolean bookLevelOnly,
            boolean includeAuthorAdvice,
            int page,
            int size) {
        IPage<InteractionPageMapper.CommentRow> result = pageMapper.selectCommentPage(
                pageRequest(page, size),
                bookId,
                chapterId,
                status,
                userId,
                bookLevelOnly,
                includeAuthorAdvice);
        return new CommentPage(
                result.getRecords().stream().map(InteractionPageMapper.CommentRow::toDomain).toList(),
                result.getTotal(),
                page,
                size);
    }

    private ParagraphAnnotationPage findParagraphAnnotations(
            Long bookId,
            Long chapterId,
            String status,
            Long userId,
            Boolean shareIntent,
            boolean requirePublishedTarget,
            boolean includeAuthorAdvice,
            int page,
            int size) {
        IPage<InteractionPageMapper.ParagraphAnnotationRow> result = pageMapper.selectParagraphAnnotationPage(
                pageRequest(page, size),
                bookId,
                chapterId,
                status,
                userId,
                shareIntent,
                requirePublishedTarget,
                includeAuthorAdvice);
        return new ParagraphAnnotationPage(
                result.getRecords().stream().map(InteractionPageMapper.ParagraphAnnotationRow::toDomain).toList(),
                result.getTotal(),
                page,
                size);
    }

    private AuthorModerationAdvice upsertCommentAdvice(
            long authorUserId,
            long bookId,
            long commentId,
            String recommendation,
            String reason) {
        int updated = jdbc.update(
                "UPDATE novel_author_comment_moderation_advice SET author_user_id = ?, recommendation = ?, reason = ?, "
                        + "updated_at = CURRENT_TIMESTAMP WHERE comment_id = ?",
                authorUserId,
                recommendation,
                reason,
                commentId);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO novel_author_comment_moderation_advice(comment_id, book_id, author_user_id, recommendation, reason, "
                            + "created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    commentId,
                    bookId,
                    authorUserId,
                    recommendation,
                    reason);
        }
        return findCommentAdvice(commentId)
                .orElseThrow(() -> new IllegalStateException("author comment moderation advice was not saved"));
    }

    private AuthorModerationAdvice upsertParagraphAnnotationAdvice(
            long authorUserId,
            long bookId,
            long annotationId,
            String recommendation,
            String reason) {
        int updated = jdbc.update(
                "UPDATE novel_author_annotation_moderation_advice SET author_user_id = ?, recommendation = ?, reason = ?, "
                        + "updated_at = CURRENT_TIMESTAMP WHERE annotation_id = ?",
                authorUserId,
                recommendation,
                reason,
                annotationId);
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO novel_author_annotation_moderation_advice(annotation_id, book_id, author_user_id, recommendation, reason, "
                            + "created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    annotationId,
                    bookId,
                    authorUserId,
                    recommendation,
                    reason);
        }
        return findParagraphAnnotationAdvice(annotationId)
                .orElseThrow(() -> new IllegalStateException("author paragraph annotation moderation advice was not saved"));
    }

    private Optional<AuthorModerationAdvice> findCommentAdvice(long commentId) {
        return jdbc.query(
                        "SELECT recommendation, reason, updated_at FROM novel_author_comment_moderation_advice WHERE comment_id = ?",
                        AUTHOR_ADVICE_MAPPER,
                        commentId)
                .stream()
                .findFirst();
    }

    private Optional<AuthorModerationAdvice> findParagraphAnnotationAdvice(long annotationId) {
        return jdbc.query(
                        "SELECT recommendation, reason, updated_at FROM novel_author_annotation_moderation_advice WHERE annotation_id = ?",
                        AUTHOR_ADVICE_MAPPER,
                        annotationId)
                .stream()
                .findFirst();
    }

    private static void requirePendingOwnedInteraction(long actualBookId, long requestedBookId, String status, String resourceName) {
        if (actualBookId != requestedBookId) {
            throw new java.util.NoSuchElementException(resourceName + " does not belong to this book");
        }
        if (!PENDING_REVIEW.equals(status)) {
            throw new IllegalStateException(resourceName + " is not awaiting station review");
        }
    }

    private static String recommendation(boolean recommendVisible) {
        return recommendVisible ? "RECOMMEND_VISIBLE" : "RECOMMEND_REJECTED";
    }

    private Comment lockComment(long commentId) {
        List<Comment> comments = jdbc.query(
                "SELECT id, book_id, chapter_id, user_id, author_name, content, status, created_at FROM novel_comment "
                        + "WHERE id = ? FOR UPDATE",
                COMMENT_MAPPER,
                commentId);
        if (comments.isEmpty()) {
            throw new java.util.NoSuchElementException("comment not found");
        }
        return comments.getFirst();
    }

    private ParagraphAnnotation lockParagraphAnnotation(long annotationId) {
        List<ParagraphAnnotation> annotations = jdbc.query(
                "SELECT id, book_id, chapter_id, user_id, author_name, paragraph_index, selection_start, selection_end, "
                        + "selected_text, note, share_intent, status, created_at "
                        + "FROM novel_paragraph_annotation WHERE id = ? FOR UPDATE",
                PARAGRAPH_ANNOTATION_MAPPER,
                annotationId);
        if (annotations.isEmpty()) {
            throw new java.util.NoSuchElementException("paragraph annotation not found");
        }
        return annotations.getFirst();
    }

    private void incrementVisibleCommentCount(long bookId, long delta) {
        MutableStats stats = lockStats(bookId);
        long next = Math.addExact(stats.visibleCommentCount(), delta);
        if (next < 0) {
            throw new IllegalStateException("visible comment count cannot be negative");
        }
        jdbc.update(
                "UPDATE novel_book_interaction_stat SET visible_comment_count = ?, updated_at = CURRENT_TIMESTAMP WHERE book_id = ?",
                next,
                bookId);
    }

    private MutableStats lockStats(long bookId) {
        jdbc.update(
                "INSERT INTO novel_book_interaction_stat(book_id, visible_comment_count, rating_count, rating_total, "
                        + "recommendation_vote_count, monthly_vote_count, updated_at) "
                        + "VALUES (?, 0, 0, 0, 0, 0, CURRENT_TIMESTAMP) "
                        + "ON DUPLICATE KEY UPDATE book_id = book_id",
                bookId);
        List<MutableStats> rows = jdbc.query(
                "SELECT visible_comment_count, rating_count, rating_total, recommendation_vote_count, monthly_vote_count "
                        + "FROM novel_book_interaction_stat WHERE book_id = ? FOR UPDATE",
                STATS_MAPPER,
                bookId);
        if (rows.isEmpty()) {
            throw new IllegalStateException("interaction statistics were not initialized");
        }
        return rows.getFirst();
    }

    private int lockVoteQuota(long userId, String voteType, LocalDate windowStart) {
        jdbc.update(
                "INSERT INTO novel_vote_quota_usage(user_id, vote_type, window_start, used_count, updated_at) "
                        + "VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP) ON DUPLICATE KEY UPDATE user_id = user_id",
                userId,
                voteType,
                Date.valueOf(windowStart));
        List<Integer> values = jdbc.query(
                "SELECT used_count FROM novel_vote_quota_usage WHERE user_id = ? AND vote_type = ? "
                        + "AND window_start = ? FOR UPDATE",
                (resultSet, rowNumber) -> resultSet.getInt("used_count"),
                userId,
                voteType,
                Date.valueOf(windowStart));
        if (values.isEmpty()) {
            throw new IllegalStateException("vote quota was not initialized");
        }
        return values.getFirst();
    }

    private static LocalDate voteWindowStart(String voteType, LocalDate today) {
        return "monthly".equals(voteType) ? today.withDayOfMonth(1) : today;
    }

    private static String voteQuotaExceededMessage(String voteType) {
        return "monthly".equals(voteType)
                ? "monthly vote quota reached for this month"
                : "recommendation vote quota reached for today";
    }

    private void updateRatingStats(long bookId, long ratingCount, long ratingTotal) {
        if (ratingCount < 0 || ratingTotal < 0) {
            throw new IllegalStateException("rating statistics cannot be negative");
        }
        int changed = jdbc.update(
                "UPDATE novel_book_interaction_stat SET rating_count = ?, rating_total = ?, updated_at = CURRENT_TIMESTAMP WHERE book_id = ?",
                ratingCount,
                ratingTotal,
                bookId);
        if (changed != 1) {
            throw new IllegalStateException("rating statistics were not updated");
        }
    }

    private static final RowMapper<MutableStats> STATS_MAPPER = (resultSet, rowNumber) -> new MutableStats(
            resultSet.getLong("visible_comment_count"),
            resultSet.getLong("rating_count"),
            resultSet.getLong("rating_total"),
            resultSet.getLong("recommendation_vote_count"),
            resultSet.getLong("monthly_vote_count"));
    private static final RowMapper<AuthorModerationAdvice> AUTHOR_ADVICE_MAPPER = (resultSet, rowNumber) -> new AuthorModerationAdvice(
            resultSet.getString("recommendation"),
            resultSet.getString("reason"),
            instant(resultSet.getTimestamp("updated_at")));

    private static String optionalCommentStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        return normalizeCommentStatus(status);
    }

    private static String normalizeCommentStatus(String status) {
        String normalized = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!PENDING_REVIEW.equals(normalized) && !VISIBLE.equals(normalized) && !REJECTED.equals(normalized)) {
            throw new IllegalArgumentException("unsupported comment status");
        }
        return normalized;
    }

    private static String optionalAnnotationStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        return normalizeAnnotationStatus(status);
    }

    private static String normalizeAnnotationStatus(String status) {
        String normalized = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!PRIVATE.equals(normalized)
                && !PENDING_REVIEW.equals(normalized)
                && !VISIBLE.equals(normalized)
                && !REJECTED.equals(normalized)) {
            throw new IllegalArgumentException("unsupported paragraph annotation status");
        }
        return normalized;
    }

    private static String requireVoteType(String voteType) {
        String normalized = voteType == null ? "" : voteType.trim().toLowerCase(Locale.ROOT);
        if (!"recommendation".equals(normalized) && !"monthly".equals(normalized)) {
            throw new IllegalArgumentException("unsupported vote type");
        }
        return normalized;
    }

    private static <T> Page<T> pageRequest(int page, int size) {
        if (page < 0) {
            throw new IllegalArgumentException("page must be non-negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        }
        return new Page<>(Math.addExact((long) page, 1L), size, true);
    }

    private static double average(long total, long count) {
        return count == 0 ? 0 : (double) total / count;
    }

    private static Long nullableLong(Object value) {
        return value instanceof Number number ? number.longValue() : null;
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp.toInstant();
    }

    private static long generatedId(KeyHolder keyHolder, String resourceName) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a generated " + resourceName + " id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric " + resourceName + " id");
        }
        return number.longValue();
    }

    private record MutableStats(
            long visibleCommentCount,
            long ratingCount,
            long ratingTotal,
            long recommendationVoteCount,
            long monthlyVoteCount) {
        InteractionStats toPublic() {
            return new InteractionStats(
                    visibleCommentCount,
                    ratingCount,
                    average(ratingTotal, ratingCount),
                    recommendationVoteCount,
                    monthlyVoteCount);
        }
    }

    public record VoteReceipt(String type, long count, int remaining, int limit) {}
}
