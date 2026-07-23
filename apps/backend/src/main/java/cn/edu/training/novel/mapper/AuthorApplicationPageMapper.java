package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus projection for the administrator's pending author-application queue. */
@Mapper
public interface AuthorApplicationPageMapper {
    @Select("""
            SELECT id,
                   user_id AS userId,
                   pen_name AS penName,
                   statement,
                   status,
                   decision_reason AS reason,
                   created_at AS createdAt,
                   decided_at AS decidedAt,
                   decided_by_user_id AS decidedByUserId,
                   reapply_available_at AS reapplyAvailableAt
            FROM novel_author_application
            WHERE status = 'PENDING'
            ORDER BY created_at ASC, id ASC
            """)
    IPage<AuthorApplicationRow> selectPendingApplicationPage(Page<AuthorApplicationRow> page);

    final class AuthorApplicationRow {
        private long id;
        private long userId;
        private String penName;
        private String statement;
        private String status;
        private String reason;
        private Timestamp createdAt;
        private Timestamp decidedAt;
        private Long decidedByUserId;
        private Timestamp reapplyAvailableAt;

        public long getId() { return id; }
        public void setId(long value) { id = value; }
        public long getUserId() { return userId; }
        public void setUserId(long value) { userId = value; }
        public String getPenName() { return penName; }
        public void setPenName(String value) { penName = value; }
        public String getStatement() { return statement; }
        public void setStatement(String value) { statement = value; }
        public String getStatus() { return status; }
        public void setStatus(String value) { status = value; }
        public String getReason() { return reason; }
        public void setReason(String value) { reason = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { createdAt = value; }
        public Timestamp getDecidedAt() { return decidedAt; }
        public void setDecidedAt(Timestamp value) { decidedAt = value; }
        public Long getDecidedByUserId() { return decidedByUserId; }
        public void setDecidedByUserId(Long value) { decidedByUserId = value; }
        public Timestamp getReapplyAvailableAt() { return reapplyAvailableAt; }
        public void setReapplyAvailableAt(Timestamp value) { reapplyAvailableAt = value; }
    }
}
