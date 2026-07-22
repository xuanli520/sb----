package cn.edu.training.novel;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=false",
        "spring.datasource.url=jdbc:h2:mem:production_identity_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ProductionIdentityIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AuthService authService;

    @Test void developmentRoleHeadersAreRejectedButBackendIssuedSessionIsAcceptedInProduction() throws Exception {
        mvc.perform(get("/api/v1/admin/dashboard")
                        .header("X-Novel-Internal-Key", "local-novel-internal-key")
                        .header("X-Novel-Principal", "admin"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/dashboard")
                        .header("X-Novel-Internal-Key", "local-novel-internal-key")
                        .header("X-Novel-Development-Principal", "admin"))
                .andExpect(status().isUnauthorized());

        String sessionId = authService.register(
                "production.reader@example.test", "生产读者", "correct-horse-battery-staple").bffSessionId();

        mvc.perform(get("/api/v1/account/profile").header("X-Novel-Bff-Session", sessionId))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", "local-novel-internal-key")
                        .header("X-Novel-Bff-Session", sessionId))
                .andExpect(status().isOk());
        // /author must resolve the opaque server-side session too. This specifically
        // guards against treating /api/v1/author as a prefix of /api/v1/auth.
        mvc.perform(get("/api/v1/author/books")
                        .header("X-Novel-Internal-Key", "local-novel-internal-key")
                        .header("X-Novel-Bff-Session", sessionId)
                        .header("X-Novel-Development-Principal", "author"))
                .andExpect(status().isForbidden());
    }

}
