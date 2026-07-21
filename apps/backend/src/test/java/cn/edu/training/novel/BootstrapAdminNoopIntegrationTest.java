package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** The optional production bootstrap must not create an implicit privileged account. */
@SpringBootTest(properties = {
        "novel.internal-api-key=bootstrap-admin-test-internal-key",
        "novel.bootstrap-admin.username=",
        "novel.bootstrap-admin.display-name=",
        "novel.bootstrap-admin.password=",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:bootstrap_admin_noop_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BootstrapAdminNoopIntegrationTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    void absentBootstrapConfigurationDoesNotCreateAnyAccount() {
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_account", Integer.class)).isZero();
    }
}
