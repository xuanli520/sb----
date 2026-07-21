package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.config.BootstrapAdminProperties;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AuthService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Covers the deployment bootstrap path through storage, BFF login, and server-side role checks. */
@SpringBootTest(properties = {
        "novel.runtime-mode=PRODUCTION",
        "novel.internal-api-key=bootstrap-admin-test-internal-key",
        "novel.development-auth-enabled=false",
        "novel.bootstrap-admin.username=bootstrap.admin@example.test",
        "novel.bootstrap-admin.display-name=Production Bootstrap Admin",
        "novel.bootstrap-admin.password=correct-horse-battery-staple",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:bootstrap_admin_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BootstrapAdminIntegrationTest {
    private static final String INTERNAL_KEY = "bootstrap-admin-test-internal-key";
    private static final String USERNAME = "bootstrap.admin@example.test";
    private static final String DISPLAY_NAME = "Production Bootstrap Admin";
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Autowired JdbcTemplate jdbc;
    @Autowired AuthService authService;
    @Autowired BootstrapAdminProperties bootstrapAdminProperties;
    @Autowired MockMvc mvc;

    @Test
    void applicationStartupCreatesConfiguredAdministratorWithHashedCredentials() {
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE login_name = ?", Integer.class, USERNAME)).isEqualTo(1);
        String passwordHash = jdbc.queryForObject(
                "SELECT password_hash FROM novel_account WHERE login_name = ?", String.class, USERNAME);
        assertThat(passwordHash).startsWith("$2").isNotEqualTo(PASSWORD);
        assertThat(new BCryptPasswordEncoder().matches(PASSWORD, passwordHash)).isTrue();
        assertThat(jdbc.queryForObject(
                "SELECT roles FROM novel_account WHERE login_name = ?", String.class, USERNAME)).contains(Role.ADMIN.name());
        assertThat(jdbc.queryForObject(
                "SELECT enabled FROM novel_account WHERE login_name = ?", Boolean.class, USERNAME)).isTrue();
    }

    @Test
    void configuredAccountIsSafelyUpgradedAndRepeatedBootstrapIsIdempotent() {
        String originalHash = jdbc.queryForObject(
                "SELECT password_hash FROM novel_account WHERE login_name = ?", String.class, USERNAME);
        jdbc.update(
                "UPDATE novel_account SET display_name = ?, roles = ?, enabled = FALSE WHERE login_name = ?",
                "stale bootstrap identity",
                Role.READER.name(),
                USERNAME);

        BootstrapAdminProperties.ConfiguredAdmin configuredAdmin = bootstrapAdminProperties.configuredAdmin().orElseThrow();
        assertThat(authService.bootstrapAdministrator(configuredAdmin))
                .isEqualTo(AuthService.BootstrapAdminResult.UPGRADED);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE login_name = ?", Integer.class, USERNAME)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT display_name FROM novel_account WHERE login_name = ?", String.class, USERNAME)).isEqualTo(DISPLAY_NAME);
        assertThat(jdbc.queryForObject(
                "SELECT roles FROM novel_account WHERE login_name = ?", String.class, USERNAME)).contains(Role.ADMIN.name());
        assertThat(jdbc.queryForObject(
                "SELECT enabled FROM novel_account WHERE login_name = ?", Boolean.class, USERNAME)).isTrue();
        assertThat(jdbc.queryForObject(
                "SELECT password_hash FROM novel_account WHERE login_name = ?", String.class, USERNAME))
                .isEqualTo(originalHash);

        assertThat(authService.bootstrapAdministrator(configuredAdmin))
                .isEqualTo(AuthService.BootstrapAdminResult.UNCHANGED);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE login_name = ?", Integer.class, USERNAME)).isEqualTo(1);
    }

    @Test
    void configuredAdministratorCanLoginAndItsServerSideSessionHasAdminAccess() throws Exception {
        String loginBody = mvc.perform(post("/api/v1/auth/login")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + USERNAME + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.roles").isArray())
                .andExpect(jsonPath("$.data.user.roles").value(org.hamcrest.Matchers.hasItem(Role.ADMIN.name())))
                .andReturn().getResponse().getContentAsString();
        String sessionId = JsonPath.read(loginBody, "$.data.sessionId");

        mvc.perform(get("/api/v1/admin/dashboard")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", sessionId))
                .andExpect(status().isOk());
    }
}
