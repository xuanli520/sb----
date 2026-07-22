package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.CommercialRuleAudit;
import cn.edu.training.novel.domain.CommercialRules;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** JDBC persistence for the one active policy and its immutable administrative history. */
@Repository
public class CommercialRuleRepository {
    private static final String RULE_COLUMNS = "membership_days_maximum_per_code, recommendation_votes_per_day, "
            + "monthly_votes_per_month, reward_minimum_tokens, reward_maximum_tokens_per_reward, "
            + "reward_maximum_tokens_per_day, updated_at";

    private static final RowMapper<CommercialRules> RULE_MAPPER = (resultSet, rowNumber) -> new CommercialRules(
            resultSet.getInt("membership_days_maximum_per_code"),
            resultSet.getInt("recommendation_votes_per_day"),
            resultSet.getInt("monthly_votes_per_month"),
            resultSet.getInt("reward_minimum_tokens"),
            resultSet.getInt("reward_maximum_tokens_per_reward"),
            resultSet.getInt("reward_maximum_tokens_per_day"),
            instant(resultSet.getTimestamp("updated_at")));

    private final JdbcTemplate jdbc;

    public CommercialRuleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public CommercialRules current() {
        return queryCurrent(false);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public CommercialRules lockCurrent() {
        return queryCurrent(true);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void updateCurrent(CommercialRules rules, long operatorUserId) {
        int changed = jdbc.update(
                "UPDATE novel_commercial_rule SET membership_days_maximum_per_code = ?, recommendation_votes_per_day = ?, "
                        + "monthly_votes_per_month = ?, reward_minimum_tokens = ?, reward_maximum_tokens_per_reward = ?, "
                        + "reward_maximum_tokens_per_day = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
                rules.membershipDaysMaximumPerCode(),
                rules.recommendationVotesPerDay(),
                rules.monthlyVotesPerMonth(),
                rules.rewardMinimumTokens(),
                rules.rewardMaximumTokensPerReward(),
                rules.rewardMaximumTokensPerDay(),
                operatorUserId);
        if (changed != 1) {
            throw new IllegalStateException("commercial rule configuration is unavailable");
        }
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public CommercialRuleAudit recordAudit(
            CommercialRules previous,
            CommercialRules updated,
            String reason,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_commercial_rule_audit("
                            + "previous_membership_days_maximum_per_code, previous_recommendation_votes_per_day, "
                            + "previous_monthly_votes_per_month, previous_reward_minimum_tokens, "
                            + "previous_reward_maximum_tokens_per_reward, previous_reward_maximum_tokens_per_day, previous_updated_at, "
                            + "membership_days_maximum_per_code, recommendation_votes_per_day, monthly_votes_per_month, "
                            + "reward_minimum_tokens, reward_maximum_tokens_per_reward, reward_maximum_tokens_per_day, "
                            + "reason, operator_user_id, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setInt(1, previous.membershipDaysMaximumPerCode());
            statement.setInt(2, previous.recommendationVotesPerDay());
            statement.setInt(3, previous.monthlyVotesPerMonth());
            statement.setInt(4, previous.rewardMinimumTokens());
            statement.setInt(5, previous.rewardMaximumTokensPerReward());
            statement.setInt(6, previous.rewardMaximumTokensPerDay());
            statement.setTimestamp(7, Timestamp.from(previous.updatedAt()));
            statement.setInt(8, updated.membershipDaysMaximumPerCode());
            statement.setInt(9, updated.recommendationVotesPerDay());
            statement.setInt(10, updated.monthlyVotesPerMonth());
            statement.setInt(11, updated.rewardMinimumTokens());
            statement.setInt(12, updated.rewardMaximumTokensPerReward());
            statement.setInt(13, updated.rewardMaximumTokensPerDay());
            statement.setString(14, reason);
            statement.setLong(15, operatorUserId);
            return statement;
        }, keyHolder);
        long auditId = generatedId(keyHolder);
        return auditsById(auditId).stream().findFirst()
                .orElseThrow(() -> new IllegalStateException("commercial rule audit was not saved"));
    }

    public List<CommercialRuleAudit> audits(int limit) {
        return jdbc.query(
                "SELECT id, previous_membership_days_maximum_per_code, previous_recommendation_votes_per_day, "
                        + "previous_monthly_votes_per_month, previous_reward_minimum_tokens, "
                        + "previous_reward_maximum_tokens_per_reward, previous_reward_maximum_tokens_per_day, previous_updated_at, "
                        + "membership_days_maximum_per_code, recommendation_votes_per_day, monthly_votes_per_month, "
                        + "reward_minimum_tokens, reward_maximum_tokens_per_reward, reward_maximum_tokens_per_day, "
                        + "reason, operator_user_id, created_at FROM novel_commercial_rule_audit "
                        + "ORDER BY created_at DESC, id DESC LIMIT ?",
                AUDIT_MAPPER,
                limit);
    }

    private CommercialRules queryCurrent(boolean forUpdate) {
        List<CommercialRules> values = jdbc.query(
                "SELECT " + RULE_COLUMNS + " FROM novel_commercial_rule WHERE id = 1" + (forUpdate ? " FOR UPDATE" : ""),
                RULE_MAPPER);
        if (values.isEmpty()) {
            throw new IllegalStateException("commercial rule configuration is unavailable");
        }
        return values.getFirst();
    }

    private List<CommercialRuleAudit> auditsById(long id) {
        return jdbc.query(
                "SELECT id, previous_membership_days_maximum_per_code, previous_recommendation_votes_per_day, "
                        + "previous_monthly_votes_per_month, previous_reward_minimum_tokens, "
                        + "previous_reward_maximum_tokens_per_reward, previous_reward_maximum_tokens_per_day, previous_updated_at, "
                        + "membership_days_maximum_per_code, recommendation_votes_per_day, monthly_votes_per_month, "
                        + "reward_minimum_tokens, reward_maximum_tokens_per_reward, reward_maximum_tokens_per_day, "
                        + "reason, operator_user_id, created_at FROM novel_commercial_rule_audit WHERE id = ?",
                AUDIT_MAPPER,
                id);
    }

    private static final RowMapper<CommercialRuleAudit> AUDIT_MAPPER = (resultSet, rowNumber) -> new CommercialRuleAudit(
            resultSet.getLong("id"),
            new CommercialRules(
                    resultSet.getInt("previous_membership_days_maximum_per_code"),
                    resultSet.getInt("previous_recommendation_votes_per_day"),
                    resultSet.getInt("previous_monthly_votes_per_month"),
                    resultSet.getInt("previous_reward_minimum_tokens"),
                    resultSet.getInt("previous_reward_maximum_tokens_per_reward"),
                    resultSet.getInt("previous_reward_maximum_tokens_per_day"),
                    instant(resultSet.getTimestamp("previous_updated_at"))),
            new CommercialRules(
                    resultSet.getInt("membership_days_maximum_per_code"),
                    resultSet.getInt("recommendation_votes_per_day"),
                    resultSet.getInt("monthly_votes_per_month"),
                    resultSet.getInt("reward_minimum_tokens"),
                    resultSet.getInt("reward_maximum_tokens_per_reward"),
                    resultSet.getInt("reward_maximum_tokens_per_day"),
                    instant(resultSet.getTimestamp("created_at"))),
            resultSet.getString("reason"),
            resultSet.getLong("operator_user_id"),
            instant(resultSet.getTimestamp("created_at")));

    private static Instant instant(Timestamp value) {
        return value.toInstant();
    }

    private static long generatedId(KeyHolder keyHolder) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a commercial rule audit id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric commercial rule audit id");
        }
        return number.longValue();
    }
}
