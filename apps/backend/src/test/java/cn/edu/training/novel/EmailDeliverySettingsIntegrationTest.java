package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.api.AdminController;
import cn.edu.training.novel.domain.EmailDeliverySettings;
import cn.edu.training.novel.service.EmailDeliverySenderFactory;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
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

/** Verifies that the D-06 stationmaster ADMIN role alone can use encrypted SMTP settings. */
@UseTestBffSessions
@SpringBootTest(classes = {
        NovelPlatformApplication.class,
        EmailDeliverySettingsIntegrationTest.CapturingSenderConfiguration.class
}, properties = {
        "novel.internal-api-key=email-delivery-settings-test-key",
        "novel.auth.bcrypt-strength=4",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:email_delivery_settings_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "novel.email-delivery-settings.encryption-key=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY",
        "spring.mail.host=",
        "spring.mail.username=",
        "spring.mail.password=",
        "novel.email-verification.from=",
        "novel.email-verification.hash-secret="
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class EmailDeliverySettingsIntegrationTest {
    private static final String INTERNAL_KEY = "email-delivery-settings-test-key";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired CapturingSenderFactory senderFactory;

    @Test
    void onlyTheStationmasterAdminCanReadPersistOrVerifySmtpSettings() throws Exception {
        mvc.perform(get("/api/v1/admin/email-delivery-settings")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/admin/email-delivery-settings")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(settingsPayload("first-smtp.example.test", 465, "new-smtp-password", "new-hmac-secret", "首次配置")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/email-delivery-settings/verify")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipient\":\"station.admin@example.test\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/email-delivery-settings")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/admin/email-delivery-settings")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(settingsPayload("first-smtp.example.test", 465, "new-smtp-password", "new-hmac-secret", "首次配置")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/email-delivery-settings/verify")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipient\":\"station.admin@example.test\"}"))
                .andExpect(status().isForbidden());
        assertThat(senderFactory.sent()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_email_delivery_settings", Integer.class)).isZero();

        String savedResponse = mvc.perform(put("/api/v1/admin/email-delivery-settings")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(settingsPayload("first-smtp.example.test", 465, "new-smtp-password", "new-hmac-secret", "首次配置")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.source").value("ADMIN"))
                .andExpect(jsonPath("$.data.host").value("first-smtp.example.test"))
                .andExpect(jsonPath("$.data.passwordConfigured").value(true))
                .andExpect(jsonPath("$.data.verificationHashSecretConfigured").value(true))
                .andExpect(jsonPath("$.data.password").doesNotExist())
                .andExpect(jsonPath("$.data.verificationHashSecret").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(savedResponse).doesNotContain("new-smtp-password", "new-hmac-secret");
        assertThat(jdbc.queryForObject(
                "SELECT smtp_password_ciphertext FROM novel_email_delivery_settings WHERE id = 1", String.class))
                .doesNotContain("new-smtp-password");
        assertThat(jdbc.queryForObject(
                "SELECT verification_hash_secret_ciphertext FROM novel_email_delivery_settings WHERE id = 1", String.class))
                .doesNotContain("new-hmac-secret");

        // Blank write-only secrets retain the encrypted values while the station admin changes a port.
        mvc.perform(put("/api/v1/admin/email-delivery-settings")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(settingsPayload("updated-smtp.example.test", 2525, "", "", "迁移到新的 SMTP 端口")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.host").value("updated-smtp.example.test"))
                .andExpect(jsonPath("$.data.port").value(2525));

        String readResponse = mvc.perform(get("/api/v1/admin/email-delivery-settings")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.source").value("ADMIN"))
                .andExpect(jsonPath("$.data.passwordConfigured").value(true))
                .andExpect(jsonPath("$.data.verificationHashSecretConfigured").value(true))
                .andExpect(jsonPath("$.data.password").doesNotExist())
                .andExpect(jsonPath("$.data.verificationHashSecret").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        assertThat(readResponse).doesNotContain("new-smtp-password", "new-hmac-secret");

        mvc.perform(post("/api/v1/admin/email-delivery-settings/verify")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipient\":\"station.admin@example.test\"}"))
                .andExpect(status().isOk());
        assertThat(senderFactory.settings()).containsExactly(new EmailDeliverySettings(
                EmailDeliverySettings.Source.ADMIN, true, "updated-smtp.example.test", 2525, "noreply@example.test",
                "new-smtp-password", "noreply@example.test", true, true, "new-hmac-secret", 1L,
                senderFactory.settings().getFirst().updatedAt()));
        assertThat(senderFactory.sent()).hasSize(1);
        assertThat(senderFactory.sent().getFirst().getTo()).containsExactly("station.admin@example.test");
        assertThat(senderFactory.sent().getFirst().getFrom()).isEqualTo("noreply@example.test");

        mvc.perform(post("/api/v1/auth/email-verification")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"reader.settings@example.test\"}"))
                .andExpect(status().isOk());
        assertThat(senderFactory.sent()).hasSize(2);
        assertThat(senderFactory.sent().getLast().getTo()).containsExactly("reader.settings@example.test");
        assertThat(senderFactory.settings()).hasSize(2);
        assertThat(senderFactory.settings().getLast().host()).isEqualTo("updated-smtp.example.test");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_email_delivery_settings_audit WHERE action = 'VERIFIED'", Integer.class)).isEqualTo(1);
    }

    @Test
    void smtpUpdateRequestDoesNotExposeSecretsThroughDebugToString() {
        String logged = new AdminController.EmailDeliverySettingsUpdateRequest(
                true, "smtp.example.test", 465, "noreply@example.test", "smtp-secret",
                "noreply@example.test", true, true, "hmac-secret", "initial configuration").toString();
        assertThat(logged).doesNotContain("smtp-secret", "hmac-secret");
    }

    private static String settingsPayload(String host, int port, String password, String hashSecret, String reason) {
        return """
                {"enabled":true,"host":"%s","port":%d,"username":"noreply@example.test","password":"%s","from":"noreply@example.test","smtpAuth":true,"sslEnabled":true,"verificationHashSecret":"%s","reason":"%s"}
                """.formatted(host, port, password, hashSecret, reason);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class CapturingSenderConfiguration {
        @Bean
        @Primary
        CapturingSenderFactory capturingSenderFactory() {
            return new CapturingSenderFactory();
        }
    }

    static final class CapturingSenderFactory implements EmailDeliverySenderFactory {
        private final List<EmailDeliverySettings> requestedSettings = new ArrayList<>();
        private final CapturingMailSender sender = new CapturingMailSender();

        @Override
        public JavaMailSender create(EmailDeliverySettings settings) {
            requestedSettings.add(settings);
            return sender;
        }

        List<EmailDeliverySettings> settings() {
            return List.copyOf(requestedSettings);
        }

        List<SimpleMailMessage> sent() {
            return sender.sent();
        }
    }

    static final class CapturingMailSender implements JavaMailSender {
        private final List<SimpleMailMessage> messages = new ArrayList<>();

        List<SimpleMailMessage> sent() {
            return List.copyOf(messages);
        }

        @Override public MimeMessage createMimeMessage() { return new MimeMessage(Session.getInstance(new Properties())); }
        @Override public MimeMessage createMimeMessage(InputStream contentStream) throws MailException { throw new UnsupportedOperationException(); }
        @Override public void send(MimeMessage mimeMessage) throws MailException { throw new UnsupportedOperationException(); }
        @Override public void send(MimeMessage... mimeMessages) throws MailException { throw new UnsupportedOperationException(); }
        @Override public void send(SimpleMailMessage simpleMessage) { messages.add(new SimpleMailMessage(simpleMessage)); }
        @Override public void send(SimpleMailMessage... simpleMessages) { for (SimpleMailMessage message : simpleMessages) send(message); }
    }
}
