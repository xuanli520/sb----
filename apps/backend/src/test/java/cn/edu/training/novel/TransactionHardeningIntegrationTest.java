package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.NovelStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
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

/** Covers price authority and the durable reward-request idempotency boundary end to end. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:transaction_hardening_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class TransactionHardeningIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";
    private static final long READER_ID = 3L;

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    @Autowired NovelStore store;
    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Development-Principal", "reader"))
                .build();
    }

    @Test
    void purchaseUsesPersistedPositivePriceRatherThanTheRequestAmount() throws Exception {
        assertThat(store.publishedBook(1).purchasePrice()).isEqualTo(30L);
        jdbc.update("UPDATE novel_book SET purchase_price = 41 WHERE id = 1");
        store.redeem(READER_ID, "WELCOME100");

        mvc.perform(post("/api/v1/account/books/1/purchase")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bookId").value(1))
                .andExpect(jsonPath("$.data.balance").value(59));

        assertThat(singleLong("SELECT purchase_amount FROM novel_book_entitlement WHERE user_id = 3 AND book_id = 1"))
                .isEqualTo(41L);
        assertThat(singleLong("SELECT change_amount FROM novel_token_ledger WHERE user_id = 3 AND transaction_type = 'BOOK_PURCHASE'"))
                .isEqualTo(-41L);
    }

    @Test
    void rewardHttpRequiresAWellFormedIdempotencyKey() throws Exception {
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":10}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .header("Idempotency-Key", "   ")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":10}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/account/books/1/reward")
                        .header("Idempotency-Key", "x".repeat(129))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\":10}"))
                .andExpect(status().isBadRequest());
        assertThat(singleLong("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 3")).isZero();
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 3")).isZero();
        assertThat(singleLong("SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%reward book=1 user=3%'")).isZero();
    }

    @Test
    void sameKeyAndIntentReplaysTheOriginalSuccessResponseOnlyOnce() throws Exception {
        store.redeem(READER_ID, "WELCOME100");

        mvc.perform(rewardRequest(1, 25, "reward-replay"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bookId").value(1))
                .andExpect(jsonPath("$.data.amount").value(25))
                .andExpect(jsonPath("$.data.balance").value(75));
        store.reward(READER_ID, 1, 10, "a-later-reward");
        assertThat(store.tokenBalance(READER_ID)).isEqualTo(65);

        mvc.perform(rewardRequest(1, 25, "reward-replay"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bookId").value(1))
                .andExpect(jsonPath("$.data.amount").value(25))
                .andExpect(jsonPath("$.data.balance").value(75));

        assertThat(singleLong("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 3 AND idempotency_key = 'reward-replay'"))
                .isEqualTo(1L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 3 AND transaction_type = 'BOOK_REWARD'"))
                .isEqualTo(2L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%reward book=1 user=3 amount=25%'"))
                .isEqualTo(1L);
    }

    @Test
    void sameKeyWithADifferentBookOrAmountConflictsWithoutAnotherDebit() throws Exception {
        store.redeem(READER_ID, "WELCOME100");

        mvc.perform(rewardRequest(1, 15, "reward-conflict"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.balance").value(85));
        mvc.perform(rewardRequest(1, 16, "reward-conflict"))
                .andExpect(status().isConflict());
        mvc.perform(rewardRequest(2, 15, "reward-conflict"))
                .andExpect(status().isConflict());

        assertThat(store.tokenBalance(READER_ID)).isEqualTo(85);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 3")).isEqualTo(1L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 3 AND transaction_type = 'BOOK_REWARD'"))
                .isEqualTo(1L);
    }

    @Test
    void failedDebitRollsBackTheClaimSoTheSameKeyCanRetry() throws Exception {
        mvc.perform(rewardRequest(1, 20, "reward-retry-after-failure"))
                .andExpect(status().isConflict());
        assertThat(singleLong("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 3")).isZero();
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 3")).isZero();

        store.redeem(READER_ID, "WELCOME100");
        mvc.perform(rewardRequest(1, 20, "reward-retry-after-failure"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.balance").value(80));
        assertThat(singleLong("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 3 AND idempotency_key = 'reward-retry-after-failure'"))
                .isEqualTo(1L);
    }

    @Test
    void concurrentSameKeyRequestsProduceOneRewardLedgerAndAudit() throws Exception {
        store.redeem(89L, "WELCOME100");

        List<Attempt> attempts = runConcurrently(
                () -> store.reward(89L, 1L, 20, "reward-concurrent"),
                () -> store.reward(89L, 1L, 20, "reward-concurrent"));

        assertThat(attempts).allMatch(Attempt::succeeded);
        assertThat(attempts.getFirst().response()).isEqualTo(attempts.get(1).response());
        assertThat(attempts.getFirst().response()).containsEntry("balance", 80);
        assertThat(store.tokenBalance(89L)).isEqualTo(80);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 89 AND idempotency_key = 'reward-concurrent'"))
                .isEqualTo(1L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 89 AND transaction_type = 'BOOK_REWARD'"))
                .isEqualTo(1L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%reward book=1 user=89 amount=20%'"))
                .isEqualTo(1L);
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder rewardRequest(
            long bookId, int amount, String idempotencyKey) {
        return post("/api/v1/account/books/{bookId}/reward", bookId)
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"amount\":" + amount + "}");
    }

    private List<Attempt> runConcurrently(Callable<Map<String, Object>> first, Callable<Map<String, Object>> second)
            throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Attempt>> futures = new ArrayList<>();
            futures.add(executor.submit(() -> invokeAfterStart(first, ready, start)));
            futures.add(executor.submit(() -> invokeAfterStart(second, ready, start)));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<Attempt> attempts = new ArrayList<>();
            for (Future<Attempt> future : futures) {
                attempts.add(future.get(10, TimeUnit.SECONDS));
            }
            return attempts;
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    private static Attempt invokeAfterStart(
            Callable<Map<String, Object>> action, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(5, TimeUnit.SECONDS)) {
                return Attempt.failure(new IllegalStateException("concurrent test did not start"));
            }
            return Attempt.success(action.call());
        } catch (Throwable exception) {
            return Attempt.failure(exception);
        }
    }

    private long singleLong(String sql) {
        Long value = jdbc.queryForObject(sql, Long.class);
        if (value == null) throw new AssertionError("expected a numeric query result");
        return value;
    }

    private record Attempt(Map<String, Object> response, Throwable failure) {
        static Attempt success(Map<String, Object> response) { return new Attempt(response, null); }
        static Attempt failure(Throwable failure) { return new Attempt(null, failure); }
        boolean succeeded() { return failure == null; }
    }
}
