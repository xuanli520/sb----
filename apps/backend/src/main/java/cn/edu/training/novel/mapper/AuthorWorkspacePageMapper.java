package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus page queries for potentially large author manuscript workspaces. */
@Mapper
public interface AuthorWorkspacePageMapper {
    @Select("""
            SELECT v.id,
                   v.book_id AS bookId,
                   v.title,
                   v.order_no AS orderNo,
                   v.created_at AS createdAt,
                   (SELECT COUNT(*) FROM novel_chapter chapter WHERE chapter.volume_id = v.id) AS chapterCount
            FROM novel_volume v
            JOIN novel_book b ON b.id = v.book_id
            WHERE v.book_id = #{bookId} AND b.author_id = #{authorId}
            ORDER BY v.order_no ASC, v.id ASC
            """)
    IPage<VolumeRow> selectVolumePage(
            Page<VolumeRow> page,
            @Param("authorId") long authorId,
            @Param("bookId") long bookId);

    @Select("""
            SELECT c.id,
                   c.book_id AS bookId,
                   c.volume_id AS volumeId,
                   c.title,
                   c.content,
                   c.published,
                   c.status,
                   c.scheduled_publish_at AS scheduledPublishAt,
                   c.published_at AS publishedAt,
                   c.review_reason AS reviewReason,
                   c.order_no AS orderNo,
                   v.title AS volumeTitle,
                   v.order_no AS volumeOrderNo,
                   latest.id AS latestCandidateId,
                   latest.book_id AS latestCandidateBookId,
                   latest.target_chapter_id AS latestCandidateTargetChapterId,
                   latest.volume_id AS latestCandidateVolumeId,
                   latest.candidate_type AS latestCandidateType,
                   latest.title AS latestCandidateTitle,
                   latest.content AS latestCandidateContent,
                   latest.order_no AS latestCandidateOrderNo,
                   latest.status AS latestCandidateStatus,
                   latest.review_reason AS latestCandidateReviewReason,
                   latest.moderation_audit_id AS latestCandidateModerationAuditId,
                   latest.created_by_user_id AS latestCandidateCreatedByUserId,
                   latest.created_at AS latestCandidateCreatedAt,
                   latest.reviewed_by_user_id AS latestCandidateReviewedByUserId,
                   latest.reviewed_at AS latestCandidateReviewedAt
            FROM novel_chapter c
            JOIN novel_book b ON b.id = c.book_id
            LEFT JOIN novel_volume v ON v.id = c.volume_id
            LEFT JOIN novel_chapter_candidate latest ON latest.id = (
                SELECT MAX(candidate.id)
                FROM novel_chapter_candidate candidate
                WHERE candidate.target_chapter_id = c.id
            )
            AND latest.status IN ('PENDING_REVIEW', 'REJECTED')
            WHERE c.book_id = #{bookId} AND b.author_id = #{authorId}
            ORDER BY c.order_no ASC, c.id ASC
            """)
    IPage<ChapterRow> selectChapterPage(
            Page<ChapterRow> page,
            @Param("authorId") long authorId,
            @Param("bookId") long bookId);

    final class VolumeRow {
        private long id;
        private long bookId;
        private String title;
        private int orderNo;
        private Timestamp createdAt;
        private long chapterCount;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public int getOrderNo() { return orderNo; }
        public void setOrderNo(int orderNo) { this.orderNo = orderNo; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
        public long getChapterCount() { return chapterCount; }
        public void setChapterCount(long chapterCount) { this.chapterCount = chapterCount; }
    }

    final class ChapterRow {
        private long id;
        private long bookId;
        private Long volumeId;
        private String title;
        private String content;
        private boolean published;
        private String status;
        private Timestamp scheduledPublishAt;
        private Timestamp publishedAt;
        private String reviewReason;
        private int orderNo;
        private String volumeTitle;
        private Integer volumeOrderNo;
        private Long latestCandidateId;
        private Long latestCandidateBookId;
        private Long latestCandidateTargetChapterId;
        private Long latestCandidateVolumeId;
        private String latestCandidateType;
        private String latestCandidateTitle;
        private String latestCandidateContent;
        private Integer latestCandidateOrderNo;
        private String latestCandidateStatus;
        private String latestCandidateReviewReason;
        private Long latestCandidateModerationAuditId;
        private Long latestCandidateCreatedByUserId;
        private Timestamp latestCandidateCreatedAt;
        private Long latestCandidateReviewedByUserId;
        private Timestamp latestCandidateReviewedAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public Long getVolumeId() { return volumeId; }
        public void setVolumeId(Long volumeId) { this.volumeId = volumeId; }
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
        public boolean isPublished() { return published; }
        public void setPublished(boolean published) { this.published = published; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public Timestamp getScheduledPublishAt() { return scheduledPublishAt; }
        public void setScheduledPublishAt(Timestamp scheduledPublishAt) { this.scheduledPublishAt = scheduledPublishAt; }
        public Timestamp getPublishedAt() { return publishedAt; }
        public void setPublishedAt(Timestamp publishedAt) { this.publishedAt = publishedAt; }
        public String getReviewReason() { return reviewReason; }
        public void setReviewReason(String reviewReason) { this.reviewReason = reviewReason; }
        public int getOrderNo() { return orderNo; }
        public void setOrderNo(int orderNo) { this.orderNo = orderNo; }
        public String getVolumeTitle() { return volumeTitle; }
        public void setVolumeTitle(String volumeTitle) { this.volumeTitle = volumeTitle; }
        public Integer getVolumeOrderNo() { return volumeOrderNo; }
        public void setVolumeOrderNo(Integer volumeOrderNo) { this.volumeOrderNo = volumeOrderNo; }
        public Long getLatestCandidateId() { return latestCandidateId; }
        public void setLatestCandidateId(Long latestCandidateId) { this.latestCandidateId = latestCandidateId; }
        public Long getLatestCandidateBookId() { return latestCandidateBookId; }
        public void setLatestCandidateBookId(Long latestCandidateBookId) { this.latestCandidateBookId = latestCandidateBookId; }
        public Long getLatestCandidateTargetChapterId() { return latestCandidateTargetChapterId; }
        public void setLatestCandidateTargetChapterId(Long latestCandidateTargetChapterId) { this.latestCandidateTargetChapterId = latestCandidateTargetChapterId; }
        public Long getLatestCandidateVolumeId() { return latestCandidateVolumeId; }
        public void setLatestCandidateVolumeId(Long latestCandidateVolumeId) { this.latestCandidateVolumeId = latestCandidateVolumeId; }
        public String getLatestCandidateType() { return latestCandidateType; }
        public void setLatestCandidateType(String latestCandidateType) { this.latestCandidateType = latestCandidateType; }
        public String getLatestCandidateTitle() { return latestCandidateTitle; }
        public void setLatestCandidateTitle(String latestCandidateTitle) { this.latestCandidateTitle = latestCandidateTitle; }
        public String getLatestCandidateContent() { return latestCandidateContent; }
        public void setLatestCandidateContent(String latestCandidateContent) { this.latestCandidateContent = latestCandidateContent; }
        public Integer getLatestCandidateOrderNo() { return latestCandidateOrderNo; }
        public void setLatestCandidateOrderNo(Integer latestCandidateOrderNo) { this.latestCandidateOrderNo = latestCandidateOrderNo; }
        public String getLatestCandidateStatus() { return latestCandidateStatus; }
        public void setLatestCandidateStatus(String latestCandidateStatus) { this.latestCandidateStatus = latestCandidateStatus; }
        public String getLatestCandidateReviewReason() { return latestCandidateReviewReason; }
        public void setLatestCandidateReviewReason(String latestCandidateReviewReason) { this.latestCandidateReviewReason = latestCandidateReviewReason; }
        public Long getLatestCandidateModerationAuditId() { return latestCandidateModerationAuditId; }
        public void setLatestCandidateModerationAuditId(Long latestCandidateModerationAuditId) { this.latestCandidateModerationAuditId = latestCandidateModerationAuditId; }
        public Long getLatestCandidateCreatedByUserId() { return latestCandidateCreatedByUserId; }
        public void setLatestCandidateCreatedByUserId(Long latestCandidateCreatedByUserId) { this.latestCandidateCreatedByUserId = latestCandidateCreatedByUserId; }
        public Timestamp getLatestCandidateCreatedAt() { return latestCandidateCreatedAt; }
        public void setLatestCandidateCreatedAt(Timestamp latestCandidateCreatedAt) { this.latestCandidateCreatedAt = latestCandidateCreatedAt; }
        public Long getLatestCandidateReviewedByUserId() { return latestCandidateReviewedByUserId; }
        public void setLatestCandidateReviewedByUserId(Long latestCandidateReviewedByUserId) { this.latestCandidateReviewedByUserId = latestCandidateReviewedByUserId; }
        public Timestamp getLatestCandidateReviewedAt() { return latestCandidateReviewedAt; }
        public void setLatestCandidateReviewedAt(Timestamp latestCandidateReviewedAt) { this.latestCandidateReviewedAt = latestCandidateReviewedAt; }
    }
}
