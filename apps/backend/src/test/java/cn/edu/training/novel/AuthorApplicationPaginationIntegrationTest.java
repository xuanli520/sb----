package cn.edu.training.novel;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.NovelStore;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Verifies the administrator application queue uses the shared MyBatis-Plus pagination path. */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=author-application-page-test-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:author_application_pages_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorApplicationPaginationIntegrationTest {
    private static final String INTERNAL_KEY = "author-application-page-test-internal-key";
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Autowired AuthService authService;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired NovelStore store;

    @Test
    void administratorReceivesOnlyTheRequestedPendingApplicationPage() throws Exception {
        AuthService.AuthenticatedSession first = authService.register(
                "first.application@example.test", "第一位申请人", PASSWORD);
        AuthService.AuthenticatedSession second = authService.register(
                "second.application@example.test", "第二位申请人", PASSWORD);
        long firstId = store.applyAuthor(first.user().id(), "先到作者", "第一份待审核申请材料。").id();
        long secondId = store.applyAuthor(second.user().id(), "后到作者", "第二份待审核申请材料。").id();
        jdbc.update("UPDATE novel_author_application SET created_at = ? WHERE id = ?",
                Timestamp.from(Instant.parse("2026-07-01T00:00:00Z")), firstId);
        jdbc.update("UPDATE novel_author_application SET created_at = ? WHERE id = ?",
                Timestamp.from(Instant.parse("2026-07-02T00:00:00Z")), secondId);

        mvc.perform(get("/api/v1/admin/author-applications")
                        .param("page", "1")
                        .param("size", "1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(secondId))
                .andExpect(jsonPath("$.data.items[0].penName").value("后到作者"))
                .andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(1));

        mvc.perform(get("/api/v1/admin/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());
    }
}
