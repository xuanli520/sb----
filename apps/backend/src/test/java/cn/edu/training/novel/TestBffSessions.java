package cn.edu.training.novel;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import org.springframework.core.Ordered;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.TestExecutionListeners.MergeMode;
import org.springframework.test.context.support.AbstractTestExecutionListener;

/**
 * Shared integration-test identities backed by the production BFF-session contract. The ids
 * intentionally preserve the historical fixture ownership graph: administrator=1, author=2,
 * reader=3. The listener is opt-in so tests which create independent accounts keep their own id
 * allocation untouched.
 */
public final class TestBffSessions {
    public static final String HEADER = "X-Novel-Bff-Session";
    public static final String ADMIN = "test-bff-session-admin";
    public static final String AUTHOR = "test-bff-session-author";
    public static final String READER = "test-bff-session-reader";

    private static final Instant EXPIRES_AT = Instant.parse("2037-12-31T23:59:59Z");
    private static final BCryptPasswordEncoder PASSWORD_ENCODER = new BCryptPasswordEncoder(4);

    private TestBffSessions() { }

    static void bootstrap(JdbcTemplate jdbc) {
        seed(jdbc, 1L, "test-admin@example.test", "Test Administrator", "READER,AUTHOR,ADMIN", ADMIN);
        seed(jdbc, 2L, "test-author@example.test", "Test Author", "READER,AUTHOR", AUTHOR);
        seed(jdbc, 3L, "test-reader@example.test", "Test Reader", "READER", READER);
    }

    private static void seed(
            JdbcTemplate jdbc,
            long accountId,
            String loginName,
            String displayName,
            String roles,
            String sessionId) {
        jdbc.update(
                "INSERT INTO novel_account(id, login_name, display_name, password_hash, password_change_required, roles, enabled, created_at, updated_at) "
                        + "SELECT ?, ?, ?, ?, FALSE, ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP "
                        + "WHERE NOT EXISTS (SELECT 1 FROM novel_account WHERE id = ?)",
                accountId,
                loginName,
                displayName,
                PASSWORD_ENCODER.encode("test-only-password"),
                roles,
                accountId);
        jdbc.update(
                "INSERT INTO novel_login_session(id, account_id, expires_at, created_at) "
                        + "SELECT ?, ?, ?, CURRENT_TIMESTAMP "
                        + "WHERE NOT EXISTS (SELECT 1 FROM novel_login_session WHERE id = ?)",
                accountId,
                accountId,
                Timestamp.from(EXPIRES_AT),
                accountId);
        String sessionHash = sha256(sessionId);
        jdbc.update(
                "INSERT INTO novel_bff_session(session_hash, login_session_id, expires_at, created_at) "
                        + "SELECT ?, ?, ?, CURRENT_TIMESTAMP "
                        + "WHERE NOT EXISTS (SELECT 1 FROM novel_bff_session WHERE session_hash = ?)",
                sessionHash,
                accountId,
                Timestamp.from(EXPIRES_AT),
                sessionHash);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}

/** Enables the persisted administrator/author/reader test sessions for one integration test. */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@TestExecutionListeners(listeners = TestBffSessionListener.class, mergeMode = MergeMode.MERGE_WITH_DEFAULTS)
@interface UseTestBffSessions { }

final class TestBffSessionListener extends AbstractTestExecutionListener {
    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE - 100;
    }

    @Override
    public void beforeTestMethod(TestContext testContext) {
        TestBffSessions.bootstrap(testContext.getApplicationContext().getBean(JdbcTemplate.class));
    }
}
