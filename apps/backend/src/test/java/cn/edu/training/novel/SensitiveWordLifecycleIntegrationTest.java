package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Covers the administrator-only, audited sensitive-word lifecycle rather than append-only setup. */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:sensitive_word_lifecycle_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class SensitiveWordLifecycleIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void administratorsCanRenameDisableAndDeleteVocabularyWithAnImmutableAuditTrail() throws Exception {
        mvc.perform(post("/api/v1/admin/sensitive-words")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"word\":\"生命周期屏蔽词\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/admin/sensitive-words")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"word\":\"生命周期屏蔽词\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.word").value("生命周期屏蔽词"))
                .andExpect(jsonPath("$.data.enabled").value(true));

        mvc.perform(post("/api/v1/account/books/1/comments")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"包含生命周期屏蔽词的评论\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"));

        mvc.perform(put("/api/v1/admin/sensitive-words/{word}", "生命周期屏蔽词")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"word\":\"改名屏蔽词\",\"reason\":\"修正词条名称\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.normalizedWord").value("改名屏蔽词"));

        mvc.perform(post("/api/v1/account/books/1/comments")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"包含改名屏蔽词的评论\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"));

        mvc.perform(put("/api/v1/admin/sensitive-words/{word}/enabled", "改名屏蔽词")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false,\"reason\":\"等待规则复核\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false));

        mvc.perform(post("/api/v1/account/books/1/comments")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"包含改名屏蔽词的评论\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("VISIBLE"));

        mvc.perform(delete("/api/v1/admin/sensitive-words/{word}", "改名屏蔽词")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"规则已废弃\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/admin/sensitive-words")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[?(@.word == '改名屏蔽词')]").isEmpty());
        mvc.perform(get("/api/v1/admin/sensitive-words/audits").param("page", "0").param("size", "20")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].action").value("DELETED"))
                .andExpect(jsonPath("$.data.items[0].reason").value("规则已废弃"));
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_sensitive_word_audit WHERE action IN ('CREATED', 'UPDATED', 'DISABLED', 'DELETED')",
                Integer.class)).isEqualTo(4);
    }

    @Test
    void deletionRequiresAWordToBeDisabledFirst() throws Exception {
        mvc.perform(delete("/api/v1/admin/sensitive-words/{word}", "敏感词")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"不应删除生效规则\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.msg").value("sensitive word must be disabled before deletion"));
    }
}
