package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus page queries for append-only moderation evidence. */
@Mapper
public interface ModerationHistoryPageMapper {
    @Select("""
            <script>
            SELECT id, content_type AS contentType, content_id AS contentId,
                   content_version_hash AS contentVersionHash, audit_trigger AS trigger,
                   provider, model_name AS model, decision, reason,
                   policy_version AS policyVersion, prompt_version AS promptVersion,
                   input_characters AS inputCharacters, request_id AS requestId,
                   raw_response AS rawResponse, error_summary AS errorSummary,
                   simulated, started_at AS startedAt, completed_at AS completedAt
            FROM novel_content_moderation_audit
            <if test='contentType != null'> WHERE content_type = #{contentType} </if>
            ORDER BY started_at DESC, id DESC
            </script>
            """)
    IPage<AuditRow> selectAuditPage(Page<AuditRow> page, @Param("contentType") String contentType);

    @Select("""
            SELECT id, book_id AS bookId, moderation_audit_id AS moderationAuditId,
                   reviewer_user_id AS reviewerUserId, decision, reason, reviewed_at AS reviewedAt
            FROM novel_content_moderation_review
            WHERE book_id = #{bookId}
            ORDER BY reviewed_at DESC, id DESC
            """)
    IPage<ReviewRow> selectReviewPage(Page<ReviewRow> page, @Param("bookId") long bookId);

    @Select("""
            SELECT id, book_id AS bookId, content_version_hash AS contentVersionHash,
                   status, aggregate_decision AS aggregateDecision, aggregate_reason AS aggregateReason,
                   total_chunks AS totalChunks, completed_chunks AS completedChunks,
                   current_snapshot AS currentSnapshot, created_at AS createdAt, completed_at AS completedAt
            FROM novel_book_moderation_snapshot
            WHERE book_id = #{bookId}
            ORDER BY created_at DESC, id DESC
            """)
    IPage<SnapshotRow> selectSnapshotPage(Page<SnapshotRow> page, @Param("bookId") long bookId);

    final class AuditRow {
        private long id;
        private String contentType;
        private long contentId;
        private String contentVersionHash;
        private String trigger;
        private String provider;
        private String model;
        private String decision;
        private String reason;
        private String policyVersion;
        private String promptVersion;
        private int inputCharacters;
        private String requestId;
        private String rawResponse;
        private String errorSummary;
        private boolean simulated;
        private Timestamp startedAt;
        private Timestamp completedAt;

        public long getId() { return id; }
        public void setId(long value) { id = value; }
        public String getContentType() { return contentType; }
        public void setContentType(String value) { contentType = value; }
        public long getContentId() { return contentId; }
        public void setContentId(long value) { contentId = value; }
        public String getContentVersionHash() { return contentVersionHash; }
        public void setContentVersionHash(String value) { contentVersionHash = value; }
        public String getTrigger() { return trigger; }
        public void setTrigger(String value) { trigger = value; }
        public String getProvider() { return provider; }
        public void setProvider(String value) { provider = value; }
        public String getModel() { return model; }
        public void setModel(String value) { model = value; }
        public String getDecision() { return decision; }
        public void setDecision(String value) { decision = value; }
        public String getReason() { return reason; }
        public void setReason(String value) { reason = value; }
        public String getPolicyVersion() { return policyVersion; }
        public void setPolicyVersion(String value) { policyVersion = value; }
        public String getPromptVersion() { return promptVersion; }
        public void setPromptVersion(String value) { promptVersion = value; }
        public int getInputCharacters() { return inputCharacters; }
        public void setInputCharacters(int value) { inputCharacters = value; }
        public String getRequestId() { return requestId; }
        public void setRequestId(String value) { requestId = value; }
        public String getRawResponse() { return rawResponse; }
        public void setRawResponse(String value) { rawResponse = value; }
        public String getErrorSummary() { return errorSummary; }
        public void setErrorSummary(String value) { errorSummary = value; }
        public boolean isSimulated() { return simulated; }
        public void setSimulated(boolean value) { simulated = value; }
        public Timestamp getStartedAt() { return startedAt; }
        public void setStartedAt(Timestamp value) { startedAt = value; }
        public Timestamp getCompletedAt() { return completedAt; }
        public void setCompletedAt(Timestamp value) { completedAt = value; }
    }

    final class ReviewRow {
        private long id;
        private long bookId;
        private long moderationAuditId;
        private long reviewerUserId;
        private String decision;
        private String reason;
        private Timestamp reviewedAt;

        public long getId() { return id; }
        public void setId(long value) { id = value; }
        public long getBookId() { return bookId; }
        public void setBookId(long value) { bookId = value; }
        public long getModerationAuditId() { return moderationAuditId; }
        public void setModerationAuditId(long value) { moderationAuditId = value; }
        public long getReviewerUserId() { return reviewerUserId; }
        public void setReviewerUserId(long value) { reviewerUserId = value; }
        public String getDecision() { return decision; }
        public void setDecision(String value) { decision = value; }
        public String getReason() { return reason; }
        public void setReason(String value) { reason = value; }
        public Timestamp getReviewedAt() { return reviewedAt; }
        public void setReviewedAt(Timestamp value) { reviewedAt = value; }
    }

    final class SnapshotRow {
        private long id;
        private long bookId;
        private String contentVersionHash;
        private String status;
        private String aggregateDecision;
        private String aggregateReason;
        private int totalChunks;
        private int completedChunks;
        private boolean currentSnapshot;
        private Timestamp createdAt;
        private Timestamp completedAt;

        public long getId() { return id; }
        public void setId(long value) { id = value; }
        public long getBookId() { return bookId; }
        public void setBookId(long value) { bookId = value; }
        public String getContentVersionHash() { return contentVersionHash; }
        public void setContentVersionHash(String value) { contentVersionHash = value; }
        public String getStatus() { return status; }
        public void setStatus(String value) { status = value; }
        public String getAggregateDecision() { return aggregateDecision; }
        public void setAggregateDecision(String value) { aggregateDecision = value; }
        public String getAggregateReason() { return aggregateReason; }
        public void setAggregateReason(String value) { aggregateReason = value; }
        public int getTotalChunks() { return totalChunks; }
        public void setTotalChunks(int value) { totalChunks = value; }
        public int getCompletedChunks() { return completedChunks; }
        public void setCompletedChunks(int value) { completedChunks = value; }
        public boolean isCurrentSnapshot() { return currentSnapshot; }
        public void setCurrentSnapshot(boolean value) { currentSnapshot = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { createdAt = value; }
        public Timestamp getCompletedAt() { return completedAt; }
        public void setCompletedAt(Timestamp value) { completedAt = value; }
    }
}
