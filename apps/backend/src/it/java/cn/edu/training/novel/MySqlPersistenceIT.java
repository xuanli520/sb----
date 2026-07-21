package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.NovelStore;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Real-MySQL coverage kept outside the normal unit/integration test source set. Run with
 * {@code mvn -Pmysql-it verify}; Docker is intentionally required only for that opt-in profile.
 */
@Testcontainers
@SpringBootTest(properties = {
        "novel.internal-api-key=mysql-it-internal-key",
        "novel.runtime-mode=TEST",
        "novel.auth.bcrypt-strength=4",
        "novel.scheduled-publication.enabled=false"
})
class MySqlPersistenceIT {
    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("novel_platform_it")
            .withUsername("novel_it")
            .withPassword("novel_it")
            .withCommand("--default-time-zone=+00:00");

    @Autowired Flyway flyway;
    @Autowired JdbcTemplate jdbc;
    @Autowired NovelStore store;
    @Autowired AuthService authService;

    @DynamicPropertySource
    static void mysqlProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.driver-class-name", MYSQL::getDriverClassName);
    }

    @Test
    void appliesEveryCurrentFlywayMigrationAndCreatesTheRewardIdempotencyIndex() {
        List<String> appliedVersions = jdbc.queryForList(
                "SELECT version FROM flyway_schema_history WHERE success = TRUE AND version IS NOT NULL ORDER BY installed_rank",
                String.class);

        assertThat(flyway.info().current()).isNotNull();
        assertThat(appliedVersions).contains(
                "1", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_book", Long.class)).isGreaterThanOrEqualTo(3L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(DISTINCT index_name) FROM information_schema.statistics "
                        + "WHERE table_schema = DATABASE() AND table_name = 'novel_reward_record' "
                        + "AND index_name = 'uk_novel_reward_record_rewarder_idempotency'",
                Long.class)).isEqualTo(1L);
    }

    @Test
    void resolvesAndRevokesABffSessionFromMysqlWithoutInMemoryOrRedisState() {
        AuthService.AuthenticatedSession session = authService.register(
                "mysql.persistence.reader@example.test",
                "MySQL Persistence Reader",
                "correct-horse-battery-staple");

        assertThat(authService.resolveBffSession(session.bffSessionId()))
                .hasValueSatisfying(user -> assertThat(user.id()).isEqualTo(session.user().id()));
        String storedHash = jdbc.queryForObject(
                "SELECT session_hash FROM novel_bff_session WHERE login_session_id = "
                        + "(SELECT id FROM novel_login_session WHERE account_id = ? ORDER BY id DESC LIMIT 1)",
                String.class,
                session.user().id());
        assertThat(storedHash).hasSize(64).isNotEqualTo(session.bffSessionId());

        AuthService reloadedService = new AuthService(jdbc, 4, Duration.ofHours(8));
        assertThat(reloadedService.resolveBffSession(session.bffSessionId()))
                .hasValueSatisfying(user -> assertThat(user.id()).isEqualTo(session.user().id()));

        authService.logoutBffSession(session.bffSessionId());

        assertThat(reloadedService.resolveBffSession(session.bffSessionId())).isEmpty();
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_login_session WHERE account_id = ? AND revoked_at IS NOT NULL",
                Long.class,
                session.user().id())).isEqualTo(1L);
    }

    @Test
    void replaysAnAlreadyCommittedRewardExactlyOnceAgainstMysql() {
        long readerId = 990_019L;
        String code = "MYSQL-IT-CREDIT-990019";
        String idempotencyKey = "mysql-it-reward-replay";
        jdbc.update(
                "INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, membership_days, status) "
                        + "VALUES (?, 'MYSQL-IT', 'TOKEN', 100, 0, 'ACTIVE')",
                code);

        assertThat(store.redeem(readerId, code)).containsEntry("balance", 100);
        Map<String, Object> first = store.reward(readerId, 1L, 25, idempotencyKey);
        Map<String, Object> replay = store.reward(readerId, 1L, 25, idempotencyKey);

        assertThat(replay).isEqualTo(first);
        assertThat(first).containsEntry("balance", 75);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = ? AND idempotency_key = ?",
                Long.class,
                readerId,
                idempotencyKey)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = ? AND transaction_type = 'BOOK_REWARD'",
                Long.class,
                readerId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT balance FROM novel_token_balance WHERE user_id = ?",
                Long.class,
                readerId)).isEqualTo(75L);
    }

    @Test
    void concurrentSameKeyRewardsCommitOneMutationAndReplayTheSameMysqlResponse() throws Exception {
        long readerId = 990_020L;
        String code = "MYSQL-IT-CREDIT-990020";
        String idempotencyKey = "mysql-it-reward-concurrent";
        jdbc.update(
                "INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, membership_days, status) "
                        + "VALUES (?, 'MYSQL-IT', 'TOKEN', 100, 0, 'ACTIVE')",
                code);
        store.redeem(readerId, code);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<Map<String, Object>> first = executor.submit(() -> rewardAfterStart(
                    readerId, idempotencyKey, ready, start));
            Future<Map<String, Object>> second = executor.submit(() -> rewardAfterStart(
                    readerId, idempotencyKey, ready, start));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            Map<String, Object> firstResponse = first.get(10, TimeUnit.SECONDS);
            Map<String, Object> secondResponse = second.get(10, TimeUnit.SECONDS);
            assertThat(secondResponse).isEqualTo(firstResponse);
            assertThat(firstResponse).containsEntry("balance", 70);
        } finally {
            executor.shutdownNow();
            assertThat(executor.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_reward_record WHERE rewarder_user_id = ? AND idempotency_key = ?",
                Long.class,
                readerId,
                idempotencyKey)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = ? AND transaction_type = 'BOOK_REWARD'",
                Long.class,
                readerId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT balance FROM novel_token_balance WHERE user_id = ?",
                Long.class,
                readerId)).isEqualTo(70L);
    }

    private Map<String, Object> rewardAfterStart(
            long readerId,
            String idempotencyKey,
            CountDownLatch ready,
            CountDownLatch start) throws InterruptedException {
        ready.countDown();
        if (!start.await(5, TimeUnit.SECONDS)) {
            throw new IllegalStateException("concurrent reward test did not start");
        }
        return store.reward(readerId, 1L, 30, idempotencyKey);
    }
}
