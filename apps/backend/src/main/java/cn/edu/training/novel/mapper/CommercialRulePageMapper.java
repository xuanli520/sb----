package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus query for the immutable commercial-rule audit trail. */
@Mapper
public interface CommercialRulePageMapper {
    @Select("""
            SELECT id,
                   previous_membership_days_maximum_per_code AS previousMembershipDaysMaximumPerCode,
                   previous_recommendation_votes_per_day AS previousRecommendationVotesPerDay,
                   previous_monthly_votes_per_month AS previousMonthlyVotesPerMonth,
                   previous_reward_minimum_tokens AS previousRewardMinimumTokens,
                   previous_reward_maximum_tokens_per_reward AS previousRewardMaximumTokensPerReward,
                   previous_reward_maximum_tokens_per_day AS previousRewardMaximumTokensPerDay,
                   previous_updated_at AS previousUpdatedAt,
                   membership_days_maximum_per_code AS membershipDaysMaximumPerCode,
                   recommendation_votes_per_day AS recommendationVotesPerDay,
                   monthly_votes_per_month AS monthlyVotesPerMonth,
                   reward_minimum_tokens AS rewardMinimumTokens,
                   reward_maximum_tokens_per_reward AS rewardMaximumTokensPerReward,
                   reward_maximum_tokens_per_day AS rewardMaximumTokensPerDay,
                   reason,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_commercial_rule_audit
            ORDER BY created_at DESC, id DESC
            """)
    IPage<CommercialRuleAuditRow> selectAuditPage(Page<CommercialRuleAuditRow> page);

    /** Bean projection keeps the mapper independent from the immutable nested domain snapshot. */
    final class CommercialRuleAuditRow {
        private long id;
        private int previousMembershipDaysMaximumPerCode;
        private int previousRecommendationVotesPerDay;
        private int previousMonthlyVotesPerMonth;
        private int previousRewardMinimumTokens;
        private int previousRewardMaximumTokensPerReward;
        private int previousRewardMaximumTokensPerDay;
        private Timestamp previousUpdatedAt;
        private int membershipDaysMaximumPerCode;
        private int recommendationVotesPerDay;
        private int monthlyVotesPerMonth;
        private int rewardMinimumTokens;
        private int rewardMaximumTokensPerReward;
        private int rewardMaximumTokensPerDay;
        private String reason;
        private long operatorUserId;
        private Timestamp createdAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public int getPreviousMembershipDaysMaximumPerCode() { return previousMembershipDaysMaximumPerCode; }
        public void setPreviousMembershipDaysMaximumPerCode(int value) { this.previousMembershipDaysMaximumPerCode = value; }
        public int getPreviousRecommendationVotesPerDay() { return previousRecommendationVotesPerDay; }
        public void setPreviousRecommendationVotesPerDay(int value) { this.previousRecommendationVotesPerDay = value; }
        public int getPreviousMonthlyVotesPerMonth() { return previousMonthlyVotesPerMonth; }
        public void setPreviousMonthlyVotesPerMonth(int value) { this.previousMonthlyVotesPerMonth = value; }
        public int getPreviousRewardMinimumTokens() { return previousRewardMinimumTokens; }
        public void setPreviousRewardMinimumTokens(int value) { this.previousRewardMinimumTokens = value; }
        public int getPreviousRewardMaximumTokensPerReward() { return previousRewardMaximumTokensPerReward; }
        public void setPreviousRewardMaximumTokensPerReward(int value) { this.previousRewardMaximumTokensPerReward = value; }
        public int getPreviousRewardMaximumTokensPerDay() { return previousRewardMaximumTokensPerDay; }
        public void setPreviousRewardMaximumTokensPerDay(int value) { this.previousRewardMaximumTokensPerDay = value; }
        public Timestamp getPreviousUpdatedAt() { return previousUpdatedAt; }
        public void setPreviousUpdatedAt(Timestamp value) { this.previousUpdatedAt = value; }
        public int getMembershipDaysMaximumPerCode() { return membershipDaysMaximumPerCode; }
        public void setMembershipDaysMaximumPerCode(int value) { this.membershipDaysMaximumPerCode = value; }
        public int getRecommendationVotesPerDay() { return recommendationVotesPerDay; }
        public void setRecommendationVotesPerDay(int value) { this.recommendationVotesPerDay = value; }
        public int getMonthlyVotesPerMonth() { return monthlyVotesPerMonth; }
        public void setMonthlyVotesPerMonth(int value) { this.monthlyVotesPerMonth = value; }
        public int getRewardMinimumTokens() { return rewardMinimumTokens; }
        public void setRewardMinimumTokens(int value) { this.rewardMinimumTokens = value; }
        public int getRewardMaximumTokensPerReward() { return rewardMaximumTokensPerReward; }
        public void setRewardMaximumTokensPerReward(int value) { this.rewardMaximumTokensPerReward = value; }
        public int getRewardMaximumTokensPerDay() { return rewardMaximumTokensPerDay; }
        public void setRewardMaximumTokensPerDay(int value) { this.rewardMaximumTokensPerDay = value; }
        public String getReason() { return reason; }
        public void setReason(String value) { this.reason = value; }
        public long getOperatorUserId() { return operatorUserId; }
        public void setOperatorUserId(long value) { this.operatorUserId = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { this.createdAt = value; }
    }
}
