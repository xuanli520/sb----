package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.EmailVerificationService;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

/** Exercises SMTP delivery through a test-only JavaMailSender, never a production fallback. */
@SpringBootTest(classes = {
        NovelPlatformApplication.class,
        EmailVerificationIntegrationTest.RecordingMailConfiguration.class
}, properties = {
        "novel.internal-api-key=email-verification-test-internal-key",
        "novel.auth.bcrypt-strength=4",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:email_verification_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.mail.host=smtp.example.test",
        "spring.mail.port=465",
        "spring.mail.username=noreply@example.test",
        "spring.mail.password=test-smtp-authorization-code",
        "novel.email-verification.from=noreply@example.test",
        "novel.email-verification.hash-secret=test-only-email-verification-hmac-secret"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class EmailVerificationIntegrationTest {
    private static final String INTERNAL_KEY = "email-verification-test-internal-key";
    private static final Pattern CODE = Pattern.compile("(?<![0-9])([0-9]{6})(?![0-9])");

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired EmailVerificationService emailVerificationService;
    @Autowired RecordingMailSender mailSender;

    @BeforeEach
    void resetMailSender() {
        mailSender.reset();
    }

    @Test
    void smtpDeliveryCreatesHmacOnlyStateAndAnEmailAccountCanConsumeTheCodeOnce() throws Exception {
        String delivery = mvc.perform(post("/api/v1/auth/email-verification")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"reader.verify@example.test\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.expiresAt").isString())
                .andExpect(jsonPath("$.data.resendAvailableAt").isString())
                .andReturn().getResponse().getContentAsString();

        assertThat(mailSender.sent()).hasSize(1);
        SimpleMailMessage message = mailSender.sent().getFirst();
        assertThat(message.getFrom()).isEqualTo("noreply@example.test");
        assertThat(message.getTo()).containsExactly("reader.verify@example.test");
        String code = codeFrom(message);
        assertThat(delivery).doesNotContain(code);
        assertThat(jdbc.queryForObject(
                "SELECT code_hash FROM novel_email_verification WHERE email = ?", String.class,
                "reader.verify@example.test"))
                .doesNotContain(code);
        assertThat(jdbc.queryForObject(
                "SELECT used_at FROM novel_email_verification WHERE email = ?", java.sql.Timestamp.class,
                "reader.verify@example.test"))
                .isNull();

        String registration = mvc.perform(post("/api/v1/auth/register")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"reader.verify@example.test\",\"displayName\":\"邮箱读者\",\"password\":\"correct-horse-battery-staple\",\"verificationCode\":\"" + code + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sessionId").isString())
                .andReturn().getResponse().getContentAsString();

        assertThat(registration).doesNotContain(code);
        assertThat(jdbc.queryForObject(
                "SELECT used_at FROM novel_email_verification WHERE email = ?", java.sql.Timestamp.class,
                "reader.verify@example.test"))
                .isNotNull();
        assertThatThrownBy(() -> emailVerificationService.consumeRegistrationCode("reader.verify@example.test", code))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("verification code is invalid or expired");
    }

    @Test
    void emailRegistrationRejectsMissingOrIncorrectVerificationCodeAndThrottlesResends() throws Exception {
        mvc.perform(post("/api/v1/auth/register")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"unverified@example.test\",\"displayName\":\"未验证读者\",\"password\":\"correct-horse-battery-staple\"}"))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE login_name = ?", Integer.class,
                "unverified@example.test"))
                .isZero();

        mvc.perform(post("/api/v1/auth/email-verification")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"retry.verify@example.test\"}"))
                .andExpect(status().isOk());
        String issuedCode = codeFrom(mailSender.sent().getFirst());
        String wrongCode = issuedCode.equals("000000") ? "000001" : "000000";
        mvc.perform(post("/api/v1/auth/email-verification")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"retry.verify@example.test\"}"))
                .andExpect(status().isTooManyRequests());
        assertThat(mailSender.sent()).hasSize(1);

        mvc.perform(post("/api/v1/auth/register")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"retry.verify@example.test\",\"displayName\":\"错误码读者\",\"password\":\"correct-horse-battery-staple\",\"verificationCode\":\"" + wrongCode + "\"}"))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject(
                "SELECT verification_attempts FROM novel_email_verification WHERE email = ?", Integer.class,
                "retry.verify@example.test"))
                .isEqualTo(1);
    }

    @Test
    void smtpFailureReturns503AndRollsBackTheVerificationState() throws Exception {
        mailSender.failSends = true;

        mvc.perform(post("/api/v1/auth/email-verification")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"smtp.failure@example.test\"}"))
                .andExpect(status().isServiceUnavailable());

        assertThat(mailSender.sent()).isEmpty();
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_email_verification WHERE email = ?", Integer.class,
                "smtp.failure@example.test"))
                .isZero();
    }

    private static String codeFrom(SimpleMailMessage message) {
        Matcher matcher = CODE.matcher(message.getText());
        if (!matcher.find()) {
            throw new AssertionError("test SMTP message did not contain a six-digit verification code");
        }
        return matcher.group(1);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class RecordingMailConfiguration {
        @Bean
        @Primary
        RecordingMailSender recordingMailSender() {
            return new RecordingMailSender();
        }
    }

    static final class RecordingMailSender implements JavaMailSender {
        private final List<SimpleMailMessage> sent = new ArrayList<>();
        volatile boolean failSends;

        List<SimpleMailMessage> sent() {
            return List.copyOf(sent);
        }

        void reset() {
            sent.clear();
            failSends = false;
        }

        @Override
        public MimeMessage createMimeMessage() {
            return new MimeMessage(Session.getInstance(new Properties()));
        }

        @Override
        public MimeMessage createMimeMessage(InputStream contentStream) throws MailException {
            throw new UnsupportedOperationException("MIME delivery is not exercised by this SMTP test sender");
        }

        @Override
        public void send(MimeMessage mimeMessage) throws MailException {
            throw new UnsupportedOperationException("MIME delivery is not exercised by this SMTP test sender");
        }

        @Override
        public void send(MimeMessage... mimeMessages) throws MailException {
            throw new UnsupportedOperationException("MIME delivery is not exercised by this SMTP test sender");
        }

        @Override
        public void send(SimpleMailMessage simpleMessage) throws MailException {
            if (failSends) {
                throw new org.springframework.mail.MailSendException("test SMTP failure");
            }
            sent.add(new SimpleMailMessage(simpleMessage));
        }

        @Override
        public void send(SimpleMailMessage... simpleMessages) throws MailException {
            for (SimpleMailMessage message : simpleMessages) {
                send(message);
            }
        }
    }
}
