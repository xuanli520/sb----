package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** A missing SMTP deployment configuration must close the email registration gate, never simulate it. */
@SpringBootTest(properties = {
        "novel.internal-api-key=email-verification-unavailable-test-key",
        "novel.auth.bcrypt-strength=4",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:email_verification_unavailable_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class EmailVerificationUnavailableIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void incompleteSmtpConfigurationFailsClosedForDeliveryAndEmailRegistration() throws Exception {
        mvc.perform(post("/api/v1/auth/email-verification")
                        .header("X-Novel-Internal-Key", "email-verification-unavailable-test-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"unavailable@example.test\"}"))
                .andExpect(status().isServiceUnavailable());

        mvc.perform(post("/api/v1/auth/register")
                        .header("X-Novel-Internal-Key", "email-verification-unavailable-test-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"unavailable@example.test\",\"displayName\":\"不可用读者\",\"password\":\"correct-horse-battery-staple\",\"verificationCode\":\"123456\"}"))
                .andExpect(status().isServiceUnavailable());

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE login_name = ?", Integer.class,
                "unavailable@example.test"))
                .isZero();
    }
}
