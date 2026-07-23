package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus list projection for administrative redemption-code inventory. */
@Mapper
public interface WalletPageMapper {
    @Select("""
            <script>
            SELECT code,
                   batch_no AS batchNo,
                   benefit_type AS benefitType,
                   token_amount AS tokenAmount,
                   book_id AS bookId,
                   membership_days AS membershipDays,
                   status,
                   expires_at AS expiresAt,
                   redeemed_by_user_id AS redeemedByUserId,
                   redeemed_at AS redeemedAt,
                   created_by_user_id AS createdByUserId,
                   created_at AS createdAt,
                   disabled_by_user_id AS disabledByUserId,
                   disabled_at AS disabledAt
            FROM novel_redemption_code
            WHERE 1 = 1
            <if test='codePattern != null'> AND code LIKE #{codePattern} </if>
            <if test='batchNo != null'> AND batch_no = #{batchNo} </if>
            <if test='benefitType != null'> AND benefit_type = #{benefitType} </if>
            <choose>
              <when test='status == "ACTIVE"'>
                AND status = 'ACTIVE' AND (expires_at IS NULL OR expires_at &gt; CURRENT_TIMESTAMP)
              </when>
              <when test='status == "EXPIRED"'>
                AND status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at &lt;= CURRENT_TIMESTAMP
              </when>
              <when test='status == "REDEEMED" or status == "DISABLED"'>
                AND status = #{status}
              </when>
            </choose>
            ORDER BY created_at DESC, code ASC
            </script>
            """)
    IPage<ManagedRedemptionCodeRow> selectManagedRedemptionCodePage(
            Page<ManagedRedemptionCodeRow> page,
            @Param("codePattern") String codePattern,
            @Param("batchNo") String batchNo,
            @Param("benefitType") String benefitType,
            @Param("status") String status);

    final class ManagedRedemptionCodeRow {
        private String code;
        private String batchNo;
        private String benefitType;
        private long tokenAmount;
        private Long bookId;
        private int membershipDays;
        private String status;
        private Timestamp expiresAt;
        private Long redeemedByUserId;
        private Timestamp redeemedAt;
        private Long createdByUserId;
        private Timestamp createdAt;
        private Long disabledByUserId;
        private Timestamp disabledAt;

        public String getCode() { return code; }
        public void setCode(String code) { this.code = code; }
        public String getBatchNo() { return batchNo; }
        public void setBatchNo(String batchNo) { this.batchNo = batchNo; }
        public String getBenefitType() { return benefitType; }
        public void setBenefitType(String benefitType) { this.benefitType = benefitType; }
        public long getTokenAmount() { return tokenAmount; }
        public void setTokenAmount(long tokenAmount) { this.tokenAmount = tokenAmount; }
        public Long getBookId() { return bookId; }
        public void setBookId(Long bookId) { this.bookId = bookId; }
        public int getMembershipDays() { return membershipDays; }
        public void setMembershipDays(int membershipDays) { this.membershipDays = membershipDays; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public Timestamp getExpiresAt() { return expiresAt; }
        public void setExpiresAt(Timestamp expiresAt) { this.expiresAt = expiresAt; }
        public Long getRedeemedByUserId() { return redeemedByUserId; }
        public void setRedeemedByUserId(Long redeemedByUserId) { this.redeemedByUserId = redeemedByUserId; }
        public Timestamp getRedeemedAt() { return redeemedAt; }
        public void setRedeemedAt(Timestamp redeemedAt) { this.redeemedAt = redeemedAt; }
        public Long getCreatedByUserId() { return createdByUserId; }
        public void setCreatedByUserId(Long createdByUserId) { this.createdByUserId = createdByUserId; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
        public Long getDisabledByUserId() { return disabledByUserId; }
        public void setDisabledByUserId(Long disabledByUserId) { this.disabledByUserId = disabledByUserId; }
        public Timestamp getDisabledAt() { return disabledAt; }
        public void setDisabledAt(Timestamp disabledAt) { this.disabledAt = disabledAt; }
    }
}
