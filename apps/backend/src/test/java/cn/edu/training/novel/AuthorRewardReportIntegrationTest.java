package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.NovelStore;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:author_reward_report_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorRewardReportIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    @Autowired NovelStore store;
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
    void authorSeesOnlySuccessfulOwnRewardRecordsAndTokenAggregate() throws Exception {
        long older = successfulReward(2L, 1L, 301L, 12L, Instant.parse("2026-07-05T02:00:00Z"));
        long newer = successfulReward(2L, 1L, 302L, 23L, Instant.parse("2026-07-05T03:00:00Z"));
        orphanReward(2L, 1L, 303L, 500L, Instant.parse("2026-07-05T04:00:00Z"));
        successfulReward(4L, 2L, 401L, 900L, Instant.parse("2026-07-05T05:00:00Z"));

        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(newer))
                .andExpect(jsonPath("$.data.items[0].bookId").value(1))
                .andExpect(jsonPath("$.data.items[0].bookTitle").value("星海拾光"))
                .andExpect(jsonPath("$.data.items[0].rewarderUserId").value(302))
                .andExpect(jsonPath("$.data.items[0].tokenAmount").value(23))
                .andExpect(jsonPath("$.data.items[1].id").value(older))
                .andExpect(jsonPath("$.data.summary.rewardCount").value(2))
                .andExpect(jsonPath("$.data.summary.totalTokens").value(35))
                .andExpect(jsonPath("$.data.summary.amountUnit").value("TOKEN"))
                .andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.meta.timeZone").value("Asia/Shanghai"))
                .andExpect(jsonPath("$.data.meta.dateBoundary").value("FROM_INCLUSIVE_TO_INCLUSIVE"))
                .andExpect(jsonPath("$.data.meta.recordInclusion").value("SUCCESSFUL_BOOK_REWARD_DEBIT_ONLY"));
    }

    @Test
    void failedTokenDebitDoesNotCreateAuthorRevenue() throws Exception {
        assertThatThrownBy(() -> store.reward(399L, 1L, 10, "report-failed-reward"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("insufficient tokens");

        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(0))
                .andExpect(jsonPath("$.data.summary.rewardCount").value(0))
                .andExpect(jsonPath("$.data.summary.totalTokens").value(0));
    }

    @Test
    void optionalBookAndShanghaiCalendarDatesAreAppliedBeforeAggregation() throws Exception {
        successfulReward(2L, 1L, 311L, 3L, Instant.parse("2026-06-30T15:59:59Z"));
        long start = successfulReward(2L, 1L, 312L, 5L, Instant.parse("2026-06-30T16:00:00Z"));
        long end = successfulReward(2L, 1L, 313L, 7L, Instant.parse("2026-07-01T15:59:59Z"));
        successfulReward(2L, 1L, 314L, 11L, Instant.parse("2026-07-01T16:00:00Z"));

        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("bookId", "1")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(end))
                .andExpect(jsonPath("$.data.items[1].id").value(start))
                .andExpect(jsonPath("$.data.summary.rewardCount").value(2))
                .andExpect(jsonPath("$.data.summary.totalTokens").value(12))
                .andExpect(jsonPath("$.data.meta.bookId").value(1))
                .andExpect(jsonPath("$.data.meta.from").value("2026-07-01"))
                .andExpect(jsonPath("$.data.meta.to").value("2026-07-01"));

        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("bookId", "2"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/author/reward-records")
                        .param("from", "2026-07-02")
                        .param("to", "2026-07-01"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("from", "2026-07-02")
                        .param("to", "2026-07-01"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void pagesUseStableNewestFirstOrderWhileSummaryCoversWholeFilteredResult() throws Exception {
        Instant sameMoment = Instant.parse("2026-07-08T10:00:00Z");
        long first = successfulReward(2L, 1L, 321L, 10L, sameMoment);
        long second = successfulReward(2L, 1L, 322L, 20L, sameMoment);
        long third = successfulReward(2L, 1L, 323L, 30L, sameMoment);

        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("page", "0")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(third))
                .andExpect(jsonPath("$.data.meta.total").value(3))
                .andExpect(jsonPath("$.data.summary.rewardCount").value(3))
                .andExpect(jsonPath("$.data.summary.totalTokens").value(60));
        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("page", "1")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(second))
                .andExpect(jsonPath("$.data.summary.totalTokens").value(60));

        // The first row is not on page one, but verifies that insertion-id tiebreaking is descending.
        mvc.perform(get("/api/v1/author/reward-records")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("page", "2")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(first));
    }

    private long successfulReward(long authorId, long bookId, long rewarderUserId, long amount, Instant createdAt) {
        long rewardId = reward(authorId, bookId, rewarderUserId, amount, createdAt);
        jdbc.update(
                "INSERT INTO novel_token_ledger(user_id, change_amount, balance_after, transaction_type, reference_type, reference_id, created_at) "
                        + "VALUES (?, ?, ?, 'BOOK_REWARD', 'REWARD', ?, ?)",
                rewarderUserId,
                -amount,
                10_000L,
                Long.toString(rewardId),
                Timestamp.from(createdAt));
        return rewardId;
    }

    private void orphanReward(long authorId, long bookId, long rewarderUserId, long amount, Instant createdAt) {
        reward(authorId, bookId, rewarderUserId, amount, createdAt);
    }

    private long reward(long authorId, long bookId, long rewarderUserId, long amount, Instant createdAt) {
        jdbc.update(
                "INSERT INTO novel_reward_record(rewarder_user_id, author_id, book_id, amount, created_at) VALUES (?, ?, ?, ?, ?)",
                rewarderUserId,
                authorId,
                bookId,
                amount,
                Timestamp.from(createdAt));
        Long id = jdbc.queryForObject("SELECT MAX(id) FROM novel_reward_record", Long.class);
        if (id == null) {
            throw new IllegalStateException("reward record was not created");
        }
        return id;
    }
}
