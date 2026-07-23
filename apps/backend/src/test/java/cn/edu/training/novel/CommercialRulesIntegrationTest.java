package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** Exercises D-10 policy updates through the same controllers and transactional writes as production. */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=commercial-rules-test-internal-key",
        "spring.datasource.url=jdbc:h2:mem:commercial_rules_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class CommercialRulesIntegrationTest {
    private static final String INTERNAL_KEY = "commercial-rules-test-internal-key";

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .build();
    }

    @Test
    void administratorAuditsRulesAndEveryConsumptionPathUsesTheirCurrentOrIssuedBoundary() throws Exception {
        mvc.perform(get("/api/v1/admin/commercial-rules"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/account/commercial-rules"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.membershipDaysMaximumPerCode").value(36_500))
                .andExpect(jsonPath("$.data.recommendationVotesPerDay").value(10));

        updateRules(7, 1, 1, 3, 10, 10, "收紧首期额度");
        mvc.perform(get("/api/v1/admin/commercial-rules")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.membershipDaysMaximumPerCode").value(7))
                .andExpect(jsonPath("$.data.rewardMaximumTokensPerDay").value(10));

        mvc.perform(post("/api/v1/admin/redemption-codes/import")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"MEMBER-OVER-CAP\",\"batchNo\":\"D10\",\"membershipDays\":8}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/admin/redemption-codes/import")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"MEMBER-AT-CAP\",\"batchNo\":\"D10\",\"membershipDays\":7}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.membershipDays").value(7));

        // Issued entitlements are ledger facts. A later cap applies only to new code issuance.
        updateRules(5, 1, 1, 3, 10, 10, "下调后续会员码时长");
        mvc.perform(post("/api/v1/account/redeem")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"MEMBER-AT-CAP\"}"))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject(
                "SELECT membership_days FROM novel_membership_ledger WHERE reference_id = 'MEMBER-AT-CAP'", Integer.class))
                .isEqualTo(7);

        mvc.perform(post("/api/v1/account/books/1/votes/recommendation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.type").value("recommendation"))
                .andExpect(jsonPath("$.data.limit").value(1))
                .andExpect(jsonPath("$.data.remaining").value(0));
        mvc.perform(post("/api/v1/account/books/2/votes/recommendation"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/account/books/1/votes/monthly"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.limit").value(1));
        mvc.perform(post("/api/v1/account/books/2/votes/monthly"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT used_count FROM novel_vote_quota_usage WHERE user_id = 3 AND vote_type = 'recommendation'", Integer.class))
                .isEqualTo(1);

        mvc.perform(post("/api/v1/account/redeem")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"WELCOME100\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .header("Idempotency-Key", "commercial-reward-too-low")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":2}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .header("Idempotency-Key", "commercial-reward-too-high")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":11}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .header("Idempotency-Key", "commercial-reward-6")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":6}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.balance").value(94));
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .header("Idempotency-Key", "commercial-reward-over-daily")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":5}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject(
                "SELECT used_tokens FROM novel_reward_daily_usage WHERE user_id = 3", Long.class)).isEqualTo(6L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 3", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 3 AND transaction_type = 'BOOK_REWARD'", Long.class)).isEqualTo(1L);

        // Replaying a successful idempotency key never consumes quota again and remains stable if
        // an administrator changes the active range after the original ledger debit.
        updateRules(5, 1, 1, 3, 3, 3, "活动结束后收紧打赏额度");
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .header("Idempotency-Key", "commercial-reward-6")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":6}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.balance").value(94));
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 3", Long.class)).isEqualTo(1L);

        mvc.perform(get("/api/v1/admin/commercial-rules/audits")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[2].reason").value("收紧首期额度"))
                .andExpect(jsonPath("$.data[2].updatedRules.membershipDaysMaximumPerCode").value(7));
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%commercial-rules operator=1%'", Long.class)).isEqualTo(3L);
    }

    private void updateRules(
            int membershipDaysMaximumPerCode,
            int recommendationVotesPerDay,
            int monthlyVotesPerMonth,
            int rewardMinimumTokens,
            int rewardMaximumTokensPerReward,
            int rewardMaximumTokensPerDay,
            String reason) throws Exception {
        mvc.perform(put("/api/v1/admin/commercial-rules")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"membershipDaysMaximumPerCode":%d,"recommendationVotesPerDay":%d,"monthlyVotesPerMonth":%d,
                                "rewardMinimumTokens":%d,"rewardMaximumTokensPerReward":%d,"rewardMaximumTokensPerDay":%d,"reason":"%s"}
                                """.formatted(
                                membershipDaysMaximumPerCode,
                                recommendationVotesPerDay,
                                monthlyVotesPerMonth,
                                rewardMinimumTokens,
                                rewardMaximumTokensPerReward,
                                rewardMaximumTokensPerDay,
                                reason)))
                .andExpect(status().isOk());
    }
}
