package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus pagination queries for the administrator account console. */
@Mapper
public interface AdminOperationsPageMapper {
    @Select("""
            <script>
            SELECT id,
                   login_name AS loginName,
                   display_name AS displayName,
                   roles,
                   enabled,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM novel_account
            WHERE 1 = 1
            <if test='pattern != null'>
              AND (LOWER(login_name) LIKE #{pattern} OR LOWER(display_name) LIKE #{pattern})
            </if>
            <if test='enabled != null'> AND enabled = #{enabled} </if>
            <if test='rolePattern != null'> AND roles LIKE #{rolePattern} </if>
            ORDER BY id DESC
            </script>
            """)
    IPage<AdminAccountRow> selectAccountPage(
            Page<AdminAccountRow> page,
            @Param("pattern") String pattern,
            @Param("enabled") Boolean enabled,
            @Param("rolePattern") String rolePattern);

    @Select("""
            SELECT event_type AS eventType,
                   occurred_at AS occurredAt,
                   book_id AS bookId,
                   book_title AS bookTitle,
                   chapter_id AS chapterId,
                   chapter_title AS chapterTitle,
                   event_status AS eventStatus
            FROM (
                SELECT 'READING_PROGRESS' AS event_type, progress.updated_at AS occurred_at,
                       progress.book_id AS book_id, book.title AS book_title, progress.chapter_id AS chapter_id,
                       chapter.title AS chapter_title, NULL AS event_status,
                       CONCAT('progress:', progress.book_id) AS sort_key
                  FROM novel_reader_progress progress
                  LEFT JOIN novel_book book ON book.id = progress.book_id
                  LEFT JOIN novel_chapter chapter ON chapter.id = progress.chapter_id
                 WHERE progress.user_id = #{accountId}
                UNION ALL
                SELECT 'BOOKSHELF_ADDED', shelf.added_at, shelf.book_id, book.title, NULL, NULL, NULL,
                       CONCAT('shelf:', shelf.book_id)
                  FROM novel_reader_bookshelf shelf
                  LEFT JOIN novel_book book ON book.id = shelf.book_id
                 WHERE shelf.user_id = #{accountId}
                UNION ALL
                SELECT 'CHECKIN', checkin_row.created_at, NULL, NULL, NULL, NULL, NULL,
                       CONCAT('checkin:', checkin_row.checkin_date)
                  FROM novel_reader_daily_checkin checkin_row
                 WHERE checkin_row.user_id = #{accountId}
                UNION ALL
                SELECT 'BOOKMARK_CREATED', bookmark.created_at, bookmark.book_id, book.title, bookmark.chapter_id,
                       chapter.title, NULL, CONCAT('bookmark:', bookmark.id)
                  FROM novel_reader_bookmark bookmark
                  LEFT JOIN novel_book book ON book.id = bookmark.book_id
                  LEFT JOIN novel_chapter chapter ON chapter.id = bookmark.chapter_id
                 WHERE bookmark.user_id = #{accountId}
                UNION ALL
                SELECT 'BOOK_PURCHASE', entitlement.acquired_at, entitlement.book_id, book.title, NULL, NULL,
                       entitlement.source_type, CONCAT('purchase:', entitlement.book_id)
                  FROM novel_book_entitlement entitlement
                  LEFT JOIN novel_book book ON book.id = entitlement.book_id
                 WHERE entitlement.user_id = #{accountId} AND entitlement.source_type = 'PURCHASE'
                UNION ALL
                SELECT 'REDEMPTION', redemption.redeemed_at, redemption.book_id, book.title, NULL, NULL,
                       redemption.benefit_type, CONCAT('redemption:', redemption.code)
                  FROM novel_redemption_code redemption
                  LEFT JOIN novel_book book ON book.id = redemption.book_id
                 WHERE redemption.redeemed_by_user_id = #{accountId} AND redemption.status = 'REDEEMED'
                UNION ALL
                SELECT 'REWARD_SENT', reward.created_at, reward.book_id, book.title, NULL, NULL, NULL,
                       CONCAT('reward:', reward.id)
                  FROM novel_reward_record reward
                  LEFT JOIN novel_book book ON book.id = reward.book_id
                 WHERE reward.rewarder_user_id = #{accountId}
                UNION ALL
                SELECT 'COMMENT_SUBMITTED', comment_row.created_at, comment_row.book_id, book.title,
                       comment_row.chapter_id, chapter.title, comment_row.status, CONCAT('comment:', comment_row.id)
                  FROM novel_comment comment_row
                  LEFT JOIN novel_book book ON book.id = comment_row.book_id
                  LEFT JOIN novel_chapter chapter ON chapter.id = comment_row.chapter_id
                 WHERE comment_row.user_id = #{accountId}
                UNION ALL
                SELECT 'ANNOTATION_SUBMITTED', annotation.created_at, annotation.book_id, book.title,
                       annotation.chapter_id, chapter.title, annotation.status, CONCAT('annotation:', annotation.id)
                  FROM novel_paragraph_annotation annotation
                  LEFT JOIN novel_book book ON book.id = annotation.book_id
                  LEFT JOIN novel_chapter chapter ON chapter.id = annotation.chapter_id
                 WHERE annotation.user_id = #{accountId}
                UNION ALL
                SELECT 'RATING_RECORDED', rating.updated_at, rating.book_id, book.title, NULL, NULL, NULL,
                       CONCAT('rating:', rating.book_id)
                  FROM novel_book_rating rating
                  LEFT JOIN novel_book book ON book.id = rating.book_id
                 WHERE rating.user_id = #{accountId}
                UNION ALL
                SELECT 'VOTE_CAST', vote.created_at, vote.book_id, book.title, NULL, NULL, vote.vote_type,
                       CONCAT('vote:', vote.book_id, ':', vote.vote_type)
                  FROM novel_book_vote vote
                  LEFT JOIN novel_book book ON book.id = vote.book_id
                 WHERE vote.user_id = #{accountId}
                UNION ALL
                SELECT 'READING_ACTIVITY', activity.occurred_at, activity.book_id, book.title, activity.chapter_id,
                       chapter.title, activity.event_type, CONCAT('activity:', activity.id)
                  FROM novel_reader_activity_event activity
                  LEFT JOIN novel_book book ON book.id = activity.book_id
                  LEFT JOIN novel_chapter chapter ON chapter.id = activity.chapter_id
                 WHERE activity.user_id = #{accountId}
            ) behavior_events
            ORDER BY occurred_at DESC, event_type ASC, sort_key DESC
            """)
    IPage<AdminUserBehaviorEventRow> selectAccountBehaviorEventPage(
            Page<AdminUserBehaviorEventRow> page,
            @Param("accountId") long accountId);

    @Select("""
            SELECT id,
                   account_id AS accountId,
                   previous_enabled AS previousEnabled,
                   enabled,
                   reason,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_account_status_audit
            WHERE account_id = #{accountId}
            ORDER BY created_at DESC, id DESC
            """)
    IPage<AccountStatusAuditRow> selectAccountStatusAuditPage(
            Page<AccountStatusAuditRow> page,
            @Param("accountId") long accountId);

    @Select("""
            SELECT id,
                   taxonomy_id AS taxonomyId,
                   taxonomy_type AS taxonomyType,
                   action,
                   details,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_operating_taxonomy_audit
            WHERE taxonomy_type = #{taxonomyType}
            ORDER BY created_at DESC, id DESC
            """)
    IPage<OperatingTaxonomyAuditRow> selectTaxonomyAuditPage(
            Page<OperatingTaxonomyAuditRow> page,
            @Param("taxonomyType") String taxonomyType);

    /** Mapper-local JDBC projection; the repository owns role parsing and domain conversion. */
    final class AdminAccountRow {
        private long id;
        private String loginName;
        private String displayName;
        private String roles;
        private boolean enabled;
        private Timestamp createdAt;
        private Timestamp updatedAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public String getLoginName() { return loginName; }
        public void setLoginName(String loginName) { this.loginName = loginName; }
        public String getDisplayName() { return displayName; }
        public void setDisplayName(String displayName) { this.displayName = displayName; }
        public String getRoles() { return roles; }
        public void setRoles(String roles) { this.roles = roles; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
        public Timestamp getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(Timestamp updatedAt) { this.updatedAt = updatedAt; }
    }

    /** Mapper-local, intentionally redacted event projection. */
    final class AdminUserBehaviorEventRow {
        private String eventType;
        private Timestamp occurredAt;
        private Long bookId;
        private String bookTitle;
        private Long chapterId;
        private String chapterTitle;
        private String eventStatus;

        public String getEventType() { return eventType; }
        public void setEventType(String eventType) { this.eventType = eventType; }
        public Timestamp getOccurredAt() { return occurredAt; }
        public void setOccurredAt(Timestamp occurredAt) { this.occurredAt = occurredAt; }
        public Long getBookId() { return bookId; }
        public void setBookId(Long bookId) { this.bookId = bookId; }
        public String getBookTitle() { return bookTitle; }
        public void setBookTitle(String bookTitle) { this.bookTitle = bookTitle; }
        public Long getChapterId() { return chapterId; }
        public void setChapterId(Long chapterId) { this.chapterId = chapterId; }
        public String getChapterTitle() { return chapterTitle; }
        public void setChapterTitle(String chapterTitle) { this.chapterTitle = chapterTitle; }
        public String getEventStatus() { return eventStatus; }
        public void setEventStatus(String eventStatus) { this.eventStatus = eventStatus; }
    }

    final class AccountStatusAuditRow {
        private long id;
        private long accountId;
        private boolean previousEnabled;
        private boolean enabled;
        private String reason;
        private long operatorUserId;
        private Timestamp createdAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getAccountId() { return accountId; }
        public void setAccountId(long accountId) { this.accountId = accountId; }
        public boolean isPreviousEnabled() { return previousEnabled; }
        public void setPreviousEnabled(boolean previousEnabled) { this.previousEnabled = previousEnabled; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean enabled) { this.enabled = enabled; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
        public long getOperatorUserId() { return operatorUserId; }
        public void setOperatorUserId(long operatorUserId) { this.operatorUserId = operatorUserId; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
    }

    final class OperatingTaxonomyAuditRow {
        private long id;
        private long taxonomyId;
        private String taxonomyType;
        private String action;
        private String details;
        private long operatorUserId;
        private Timestamp createdAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getTaxonomyId() { return taxonomyId; }
        public void setTaxonomyId(long taxonomyId) { this.taxonomyId = taxonomyId; }
        public String getTaxonomyType() { return taxonomyType; }
        public void setTaxonomyType(String taxonomyType) { this.taxonomyType = taxonomyType; }
        public String getAction() { return action; }
        public void setAction(String action) { this.action = action; }
        public String getDetails() { return details; }
        public void setDetails(String details) { this.details = details; }
        public long getOperatorUserId() { return operatorUserId; }
        public void setOperatorUserId(long operatorUserId) { this.operatorUserId = operatorUserId; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
    }
}
