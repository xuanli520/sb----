package cn.edu.training.novel.mapper;

import cn.edu.training.novel.domain.Book;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus-backed queries for operational and account work lists. */
@Mapper
public interface BookPageMapper {
    @Select("""
            SELECT b.id, b.title, b.author_name AS author, b.category, b.word_count AS words,
                   b.serial_status AS serialStatus, b.synopsis, NULL AS cover, b.status,
                   b.author_id AS authorId, b.heat, b.purchase_price AS purchasePrice
            FROM novel_reader_bookshelf shelf
            JOIN novel_book b ON b.id = shelf.book_id
            WHERE shelf.user_id = #{userId} AND b.status = 'PUBLISHED'
            ORDER BY shelf.added_at DESC, b.id ASC
            """)
    IPage<Book> selectBookshelfPage(Page<Book> page, @Param("userId") long userId);

    /** A constant-cost state lookup for reader surfaces; unpublished works are never saved here. */
    @Select("""
            SELECT EXISTS(
                SELECT 1
                FROM novel_reader_bookshelf shelf
                JOIN novel_book b ON b.id = shelf.book_id
                WHERE shelf.user_id = #{userId}
                  AND shelf.book_id = #{bookId}
                  AND b.status = 'PUBLISHED'
            )
            """)
    boolean existsBookshelfBook(@Param("userId") long userId, @Param("bookId") long bookId);

    @Select("""
            SELECT b.id, b.title, b.author_name AS author, b.category, b.word_count AS words,
                   b.serial_status AS serialStatus, b.synopsis, NULL AS cover, b.status,
                   b.author_id AS authorId, b.heat, b.purchase_price AS purchasePrice
            FROM novel_book b
            WHERE b.author_id = #{authorId}
            ORDER BY b.id ASC
            """)
    IPage<Book> selectAuthorBooksPage(Page<Book> page, @Param("authorId") long authorId);

    @Select("""
            SELECT b.id, b.title, b.author_name AS author, b.category, b.word_count AS words,
                   b.serial_status AS serialStatus, b.synopsis, NULL AS cover, b.status,
                   b.author_id AS authorId, b.heat, b.purchase_price AS purchasePrice
            FROM novel_book b
            WHERE b.status = 'PENDING_REVIEW'
            ORDER BY b.id ASC
            """)
    IPage<Book> selectWholeBookReviewsPage(Page<Book> page);

    /** Historical only: normal review traffic must never write or consume this old state. */
    @Select("""
            SELECT b.id, b.title, b.author_name AS author, b.category, b.word_count AS words,
                   b.serial_status AS serialStatus, b.synopsis, NULL AS cover, b.status,
                   b.author_id AS authorId, b.heat, b.purchase_price AS purchasePrice
            FROM novel_book b
            WHERE b.status = 'NEEDS_REVIEW'
            ORDER BY b.updated_at ASC, b.id ASC
            """)
    IPage<Book> selectLegacyNeedsReviewPage(Page<Book> page);

    @Select("""
            SELECT b.id, b.title, b.author_name AS author, b.category, b.word_count AS words,
                   b.serial_status AS serialStatus, b.synopsis, NULL AS cover, b.status,
                   b.author_id AS authorId, b.heat, b.purchase_price AS purchasePrice
            FROM novel_book b
            WHERE b.status IN ('PUBLISHED', 'OFFLINE')
            ORDER BY b.id DESC
            """)
    IPage<Book> selectAvailabilityManagedPage(Page<Book> page);

    @Select("""
            SELECT id,
                   book_id AS bookId,
                   action,
                   previous_status AS previousStatus,
                   status,
                   reason,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_book_status_audit
            WHERE book_id = #{bookId}
            ORDER BY created_at DESC, id DESC
            """)
    IPage<BookStatusAuditRow> selectBookStatusAuditPage(
            Page<BookStatusAuditRow> page,
            @Param("bookId") long bookId);

    @Select("""
            SELECT id,
                   book_id AS bookId,
                   action,
                   previous_status AS previousStatus,
                   status,
                   reason,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_legacy_review_triage_audit
            WHERE book_id = #{bookId}
            ORDER BY created_at DESC, id DESC
            """)
    IPage<BookStatusAuditRow> selectLegacyReviewTriageAuditPage(
            Page<BookStatusAuditRow> page,
            @Param("bookId") long bookId);

    @Select("""
            <script>
            SELECT queue.scope,
                   queue.book_id AS bookId,
                   queue.book_title AS bookTitle,
                   queue.book_author AS bookAuthor,
                   queue.book_category AS bookCategory,
                   queue.book_words AS bookWords,
                   queue.book_serial_status AS bookSerialStatus,
                   queue.book_synopsis AS bookSynopsis,
                   queue.book_cover AS bookCover,
                   queue.book_status AS bookStatus,
                   queue.book_author_id AS bookAuthorId,
                   queue.book_heat AS bookHeat,
                   queue.book_purchase_price AS bookPurchasePrice,
                   queue.candidate_id AS candidateId,
                   queue.candidate_target_chapter_id AS candidateTargetChapterId,
                   queue.candidate_volume_id AS candidateVolumeId,
                   queue.candidate_type AS candidateType,
                   queue.candidate_title AS candidateTitle,
                   queue.candidate_content AS candidateContent,
                   queue.candidate_order_no AS candidateOrderNo,
                   queue.candidate_status AS candidateStatus,
                   queue.candidate_review_reason AS candidateReviewReason,
                   queue.candidate_moderation_audit_id AS candidateModerationAuditId,
                   queue.candidate_created_by_user_id AS candidateCreatedByUserId,
                   queue.candidate_created_at AS candidateCreatedAt,
                   queue.candidate_reviewed_by_user_id AS candidateReviewedByUserId,
                   queue.candidate_reviewed_at AS candidateReviewedAt
            FROM (
                SELECT 'WHOLE_BOOK' AS scope,
                       b.id AS book_id,
                       b.title AS book_title,
                       b.author_name AS book_author,
                       b.category AS book_category,
                       b.word_count AS book_words,
                       b.serial_status AS book_serial_status,
                       b.synopsis AS book_synopsis,
                       NULL AS book_cover,
                       b.status AS book_status,
                       b.author_id AS book_author_id,
                       b.heat AS book_heat,
                       b.purchase_price AS book_purchase_price,
                       NULL AS candidate_id,
                       NULL AS candidate_target_chapter_id,
                       NULL AS candidate_volume_id,
                       NULL AS candidate_type,
                       NULL AS candidate_title,
                       NULL AS candidate_content,
                       NULL AS candidate_order_no,
                       NULL AS candidate_status,
                       NULL AS candidate_review_reason,
                       NULL AS candidate_moderation_audit_id,
                       NULL AS candidate_created_by_user_id,
                       NULL AS candidate_created_at,
                       NULL AS candidate_reviewed_by_user_id,
                       NULL AS candidate_reviewed_at,
                       b.updated_at AS queue_created_at
                FROM novel_book b
                WHERE b.status = 'PENDING_REVIEW'
                UNION ALL
                SELECT CASE WHEN c.candidate_type = 'NEW_CHAPTER'
                            THEN 'NEW_CHAPTER' ELSE 'CHAPTER_REVISION' END AS scope,
                       b.id AS book_id,
                       b.title AS book_title,
                       b.author_name AS book_author,
                       b.category AS book_category,
                       b.word_count AS book_words,
                       b.serial_status AS book_serial_status,
                       b.synopsis AS book_synopsis,
                       NULL AS book_cover,
                       b.status AS book_status,
                       b.author_id AS book_author_id,
                       b.heat AS book_heat,
                       b.purchase_price AS book_purchase_price,
                       c.id AS candidate_id,
                       c.target_chapter_id AS candidate_target_chapter_id,
                       c.volume_id AS candidate_volume_id,
                       c.candidate_type AS candidate_type,
                       c.title AS candidate_title,
                       c.content AS candidate_content,
                       c.order_no AS candidate_order_no,
                       c.status AS candidate_status,
                       c.review_reason AS candidate_review_reason,
                       c.moderation_audit_id AS candidate_moderation_audit_id,
                       c.created_by_user_id AS candidate_created_by_user_id,
                       c.created_at AS candidate_created_at,
                       c.reviewed_by_user_id AS candidate_reviewed_by_user_id,
                       c.reviewed_at AS candidate_reviewed_at,
                       c.created_at AS queue_created_at
                FROM novel_chapter_candidate c
                JOIN novel_book b ON b.id = c.book_id
                WHERE c.status = 'PENDING_REVIEW'
            ) queue
            <if test='scope != null'>
            WHERE queue.scope = #{scope}
            </if>
            ORDER BY queue.queue_created_at ASC, queue.book_id ASC, queue.candidate_id ASC
            </script>
            """)
    IPage<ModerationQueueRow> selectModerationQueuePage(
            Page<ModerationQueueRow> page,
            @Param("scope") String scope);

    final class BookStatusAuditRow {
        private long id;
        private long bookId;
        private String action;
        private String previousStatus;
        private String status;
        private String reason;
        private long operatorUserId;
        private Timestamp createdAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public String getAction() { return action; }
        public void setAction(String action) { this.action = action; }
        public String getPreviousStatus() { return previousStatus; }
        public void setPreviousStatus(String previousStatus) { this.previousStatus = previousStatus; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
        public long getOperatorUserId() { return operatorUserId; }
        public void setOperatorUserId(long operatorUserId) { this.operatorUserId = operatorUserId; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
    }

    final class ModerationQueueRow {
        private String scope;
        private long bookId;
        private String bookTitle;
        private String bookAuthor;
        private String bookCategory;
        private int bookWords;
        private String bookSerialStatus;
        private String bookSynopsis;
        private String bookCover;
        private String bookStatus;
        private long bookAuthorId;
        private long bookHeat;
        private long bookPurchasePrice;
        private Long candidateId;
        private long candidateTargetChapterId;
        private Long candidateVolumeId;
        private String candidateType;
        private String candidateTitle;
        private String candidateContent;
        private int candidateOrderNo;
        private String candidateStatus;
        private String candidateReviewReason;
        private Long candidateModerationAuditId;
        private long candidateCreatedByUserId;
        private Timestamp candidateCreatedAt;
        private Long candidateReviewedByUserId;
        private Timestamp candidateReviewedAt;

        public String getScope() { return scope; }
        public void setScope(String scope) { this.scope = scope; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public String getBookTitle() { return bookTitle; }
        public void setBookTitle(String bookTitle) { this.bookTitle = bookTitle; }
        public String getBookAuthor() { return bookAuthor; }
        public void setBookAuthor(String bookAuthor) { this.bookAuthor = bookAuthor; }
        public String getBookCategory() { return bookCategory; }
        public void setBookCategory(String bookCategory) { this.bookCategory = bookCategory; }
        public int getBookWords() { return bookWords; }
        public void setBookWords(int bookWords) { this.bookWords = bookWords; }
        public String getBookSerialStatus() { return bookSerialStatus; }
        public void setBookSerialStatus(String bookSerialStatus) { this.bookSerialStatus = bookSerialStatus; }
        public String getBookSynopsis() { return bookSynopsis; }
        public void setBookSynopsis(String bookSynopsis) { this.bookSynopsis = bookSynopsis; }
        public String getBookCover() { return bookCover; }
        public void setBookCover(String bookCover) { this.bookCover = bookCover; }
        public String getBookStatus() { return bookStatus; }
        public void setBookStatus(String bookStatus) { this.bookStatus = bookStatus; }
        public long getBookAuthorId() { return bookAuthorId; }
        public void setBookAuthorId(long bookAuthorId) { this.bookAuthorId = bookAuthorId; }
        public long getBookHeat() { return bookHeat; }
        public void setBookHeat(long bookHeat) { this.bookHeat = bookHeat; }
        public long getBookPurchasePrice() { return bookPurchasePrice; }
        public void setBookPurchasePrice(long bookPurchasePrice) { this.bookPurchasePrice = bookPurchasePrice; }
        public Long getCandidateId() { return candidateId; }
        public void setCandidateId(Long candidateId) { this.candidateId = candidateId; }
        public long getCandidateTargetChapterId() { return candidateTargetChapterId; }
        public void setCandidateTargetChapterId(long candidateTargetChapterId) { this.candidateTargetChapterId = candidateTargetChapterId; }
        public Long getCandidateVolumeId() { return candidateVolumeId; }
        public void setCandidateVolumeId(Long candidateVolumeId) { this.candidateVolumeId = candidateVolumeId; }
        public String getCandidateType() { return candidateType; }
        public void setCandidateType(String candidateType) { this.candidateType = candidateType; }
        public String getCandidateTitle() { return candidateTitle; }
        public void setCandidateTitle(String candidateTitle) { this.candidateTitle = candidateTitle; }
        public String getCandidateContent() { return candidateContent; }
        public void setCandidateContent(String candidateContent) { this.candidateContent = candidateContent; }
        public int getCandidateOrderNo() { return candidateOrderNo; }
        public void setCandidateOrderNo(int candidateOrderNo) { this.candidateOrderNo = candidateOrderNo; }
        public String getCandidateStatus() { return candidateStatus; }
        public void setCandidateStatus(String candidateStatus) { this.candidateStatus = candidateStatus; }
        public String getCandidateReviewReason() { return candidateReviewReason; }
        public void setCandidateReviewReason(String candidateReviewReason) { this.candidateReviewReason = candidateReviewReason; }
        public Long getCandidateModerationAuditId() { return candidateModerationAuditId; }
        public void setCandidateModerationAuditId(Long candidateModerationAuditId) { this.candidateModerationAuditId = candidateModerationAuditId; }
        public long getCandidateCreatedByUserId() { return candidateCreatedByUserId; }
        public void setCandidateCreatedByUserId(long candidateCreatedByUserId) { this.candidateCreatedByUserId = candidateCreatedByUserId; }
        public Timestamp getCandidateCreatedAt() { return candidateCreatedAt; }
        public void setCandidateCreatedAt(Timestamp candidateCreatedAt) { this.candidateCreatedAt = candidateCreatedAt; }
        public Long getCandidateReviewedByUserId() { return candidateReviewedByUserId; }
        public void setCandidateReviewedByUserId(Long candidateReviewedByUserId) { this.candidateReviewedByUserId = candidateReviewedByUserId; }
        public Timestamp getCandidateReviewedAt() { return candidateReviewedAt; }
        public void setCandidateReviewedAt(Timestamp candidateReviewedAt) { this.candidateReviewedAt = candidateReviewedAt; }
    }
}
