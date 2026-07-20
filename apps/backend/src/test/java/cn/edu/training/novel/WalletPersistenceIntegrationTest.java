package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** Verifies database invariants that cannot be proven by the HTTP happy-path tests alone. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:wallet_persistence_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WalletPersistenceIntegrationTest {
    @Autowired NovelStore store;
    @Autowired JdbcTemplate jdbc;

    @Test
    void redemptionPersistsCodeTransitionBalanceLedgerAndAuditInOneCommit() {
        Map<String, Object> result = store.redeem(71, " welcome100 ");

        assertThat(result).containsEntry("code", "WELCOME100").containsEntry("tokens", 100).containsEntry("balance", 100);
        assertThat(singleString("SELECT status FROM novel_redemption_code WHERE code = 'WELCOME100'")).isEqualTo("REDEEMED");
        assertThat(singleLong("SELECT redeemed_by_user_id FROM novel_redemption_code WHERE code = 'WELCOME100'")).isEqualTo(71L);
        assertThat(singleLong("SELECT balance FROM novel_token_balance WHERE user_id = 71")).isEqualTo(100L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 71")).isEqualTo(1L);
        assertThat(singleLong("SELECT change_amount FROM novel_token_ledger WHERE user_id = 71")).isEqualTo(100L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%redeem WELCOME100 user=71%'")).isEqualTo(1L);

        assertThatThrownBy(() -> store.redeem(71, "WELCOME100"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("兑换码无效、已使用或已禁用");
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 71")).isEqualTo(1L);
    }

    @Test
    void concurrentDoubleRedemptionConsumesCodeAndCreditsExactlyOnce() throws Exception {
        List<Attempt> attempts = runConcurrently(
                () -> store.redeem(72, "WELCOME100"),
                () -> store.redeem(73, "WELCOME100"));

        assertThat(attempts.stream().filter(Attempt::succeeded)).hasSize(1);
        Attempt rejected = attempts.stream().filter(attempt -> !attempt.succeeded()).findFirst().orElseThrow();
        assertThat(rejected.failure()).isInstanceOf(IllegalStateException.class)
                .hasMessage("兑换码无效、已使用或已禁用");
        assertThat(singleString("SELECT status FROM novel_redemption_code WHERE code = 'WELCOME100'")).isEqualTo("REDEEMED");
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE transaction_type = 'REDEMPTION'")).isEqualTo(1L);
        assertThat(singleLong("SELECT COALESCE(SUM(balance), 0) FROM novel_token_balance WHERE user_id IN (72, 73)"))
                .isEqualTo(100L);
    }

    @Test
    void concurrentPurchasesCreateOneEntitlementAndDebitOnce() throws Exception {
        store.redeem(74, "WELCOME100");

        List<Attempt> attempts = runConcurrently(
                () -> store.purchase(74, 1, 30),
                () -> store.purchase(74, 1, 30));

        assertThat(attempts).allMatch(Attempt::succeeded);
        assertThat(attempts).allSatisfy(attempt -> {
            assertThat(attempt.response()).containsEntry("bookId", 1L).containsEntry("purchased", true).containsEntry("balance", 70);
        });
        assertThat(store.tokenBalance(74)).isEqualTo(70);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_book_entitlement WHERE user_id = 74 AND book_id = 1")).isEqualTo(1L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 74")).isEqualTo(2L);
        assertThat(jdbc.query(
                "SELECT change_amount FROM novel_token_ledger WHERE user_id = 74 ORDER BY id",
                (resultSet, rowNumber) -> resultSet.getLong(1))).containsExactly(100L, -30L);
    }

    @Test
    void failedDebitRollsBackReservedEntitlementAndRewardRecord() {
        store.redeem(75, "WELCOME100");

        assertThatThrownBy(() -> store.purchase(75, 1, 101))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("insufficient tokens");
        assertThat(store.tokenBalance(75)).isEqualTo(100);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_book_entitlement WHERE user_id = 75 AND book_id = 1")).isZero();
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 75")).isEqualTo(1L);

        assertThatThrownBy(() -> store.reward(75, 1, 101))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("insufficient tokens");
        assertThat(store.tokenBalance(75)).isEqualTo(100);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = 75")).isZero();
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 75")).isEqualTo(1L);

        Map<String, Object> reward = store.reward(75, 1, 20);
        assertThat(reward).containsEntry("bookId", 1L).containsEntry("amount", 20).containsEntry("balance", 80);
        assertThat(singleLong("SELECT amount FROM novel_reward_record WHERE rewarder_user_id = 75")).isEqualTo(20L);
        assertThat(singleLong("SELECT author_id FROM novel_reward_record WHERE rewarder_user_id = 75")).isEqualTo(2L);
        assertThat(jdbc.query(
                "SELECT change_amount FROM novel_token_ledger WHERE user_id = 75 ORDER BY id",
                (resultSet, rowNumber) -> resultSet.getLong(1))).containsExactly(100L, -20L);
    }

    @Test
    void concurrentCreditsToNewWalletDoNotLoseBalance() throws Exception {
        insertActiveTokenCode("RACE-CREDIT-A", 50);
        insertActiveTokenCode("RACE-CREDIT-B", 50);

        List<Attempt> attempts = runConcurrently(
                () -> store.redeem(76, "RACE-CREDIT-A"),
                () -> store.redeem(76, "RACE-CREDIT-B"));

        assertThat(attempts).allMatch(Attempt::succeeded);
        assertThat(store.tokenBalance(76)).isEqualTo(100);
        assertThat(singleLong("SELECT balance FROM novel_token_balance WHERE user_id = 76")).isEqualTo(100L);
        assertThat(singleLong("SELECT COALESCE(SUM(change_amount), 0) FROM novel_token_ledger WHERE user_id = 76"))
                .isEqualTo(100L);
        assertThat(singleLong("SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 76")).isEqualTo(2L);
    }

    private void insertActiveTokenCode(String code, long tokens) {
        jdbc.update(
                "INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, book_id, membership_days, status, expires_at, redeemed_by_user_id, redeemed_at, created_at, updated_at) "
                        + "VALUES (?, 'TEST', 'TOKEN', ?, NULL, 0, 'ACTIVE', NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                code,
                tokens);
    }

    private List<Attempt> runConcurrently(
            Callable<Map<String, Object>> first,
            Callable<Map<String, Object>> second) throws Exception {
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
            Callable<Map<String, Object>> action,
            CountDownLatch ready,
            CountDownLatch start) {
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

    private String singleString(String sql) {
        String value = jdbc.queryForObject(sql, String.class);
        if (value == null) throw new AssertionError("expected a string query result");
        return value;
    }

    private record Attempt(Map<String, Object> response, Throwable failure) {
        static Attempt success(Map<String, Object> response) { return new Attempt(response, null); }
        static Attempt failure(Throwable failure) { return new Attempt(null, failure); }
        boolean succeeded() { return failure == null; }
    }
}
