package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus page queries for the administrator-managed moderation vocabulary. */
@Mapper
public interface SensitiveWordPageMapper {
    @Select("""
            <script>
            SELECT normalized_word AS normalizedWord,
                   word,
                   enabled,
                   created_by_user_id AS createdByUserId,
                   updated_by_user_id AS updatedByUserId,
                   disabled_by_user_id AS disabledByUserId,
                   disabled_at AS disabledAt,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM novel_sensitive_word
            WHERE 1 = 1
            <if test='queryPattern != null'>
              AND (LOWER(normalized_word) LIKE #{queryPattern} ESCAPE '!' OR LOWER(word) LIKE #{queryPattern} ESCAPE '!')
            </if>
            <if test='enabled != null'> AND enabled = #{enabled} </if>
            ORDER BY enabled DESC, normalized_word ASC
            </script>
            """)
    IPage<SensitiveWordRow> selectSensitiveWordPage(
            Page<SensitiveWordRow> page,
            @Param("queryPattern") String queryPattern,
            @Param("enabled") Boolean enabled);

    @Select("""
            <script>
            SELECT id,
                   normalized_word AS normalizedWord,
                   previous_word AS previousWord,
                   word,
                   previous_enabled AS previousEnabled,
                   enabled,
                   action,
                   reason,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_sensitive_word_audit
            WHERE 1 = 1
            <if test='normalizedWord != null'> AND normalized_word = #{normalizedWord} </if>
            <if test='action != null'> AND action = #{action} </if>
            ORDER BY created_at DESC, id DESC
            </script>
            """)
    IPage<SensitiveWordAuditRow> selectSensitiveWordAuditPage(
            Page<SensitiveWordAuditRow> page,
            @Param("normalizedWord") String normalizedWord,
            @Param("action") String action);

    final class SensitiveWordRow {
        private String normalizedWord;
        private String word;
        private boolean enabled;
        private Long createdByUserId;
        private Long updatedByUserId;
        private Long disabledByUserId;
        private Timestamp disabledAt;
        private Timestamp createdAt;
        private Timestamp updatedAt;

        public String getNormalizedWord() { return normalizedWord; }
        public void setNormalizedWord(String value) { normalizedWord = value; }
        public String getWord() { return word; }
        public void setWord(String value) { word = value; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean value) { enabled = value; }
        public Long getCreatedByUserId() { return createdByUserId; }
        public void setCreatedByUserId(Long value) { createdByUserId = value; }
        public Long getUpdatedByUserId() { return updatedByUserId; }
        public void setUpdatedByUserId(Long value) { updatedByUserId = value; }
        public Long getDisabledByUserId() { return disabledByUserId; }
        public void setDisabledByUserId(Long value) { disabledByUserId = value; }
        public Timestamp getDisabledAt() { return disabledAt; }
        public void setDisabledAt(Timestamp value) { disabledAt = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { createdAt = value; }
        public Timestamp getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(Timestamp value) { updatedAt = value; }
    }

    final class SensitiveWordAuditRow {
        private long id;
        private String normalizedWord;
        private String previousWord;
        private String word;
        private Boolean previousEnabled;
        private Boolean enabled;
        private String action;
        private String reason;
        private long operatorUserId;
        private Timestamp createdAt;

        public long getId() { return id; }
        public void setId(long value) { id = value; }
        public String getNormalizedWord() { return normalizedWord; }
        public void setNormalizedWord(String value) { normalizedWord = value; }
        public String getPreviousWord() { return previousWord; }
        public void setPreviousWord(String value) { previousWord = value; }
        public String getWord() { return word; }
        public void setWord(String value) { word = value; }
        public Boolean getPreviousEnabled() { return previousEnabled; }
        public void setPreviousEnabled(Boolean value) { previousEnabled = value; }
        public Boolean getEnabled() { return enabled; }
        public void setEnabled(Boolean value) { enabled = value; }
        public String getAction() { return action; }
        public void setAction(String value) { action = value; }
        public String getReason() { return reason; }
        public void setReason(String value) { reason = value; }
        public long getOperatorUserId() { return operatorUserId; }
        public void setOperatorUserId(long value) { operatorUserId = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { createdAt = value; }
    }
}
