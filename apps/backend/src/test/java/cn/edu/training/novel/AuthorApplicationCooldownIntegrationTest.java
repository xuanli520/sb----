package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.AuthorApplication;
import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.NovelStore;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Covers the D-05 rejection boundary through the deployed controller and persisted application rows. */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=author-cooldown-test-internal-key",
        "novel.scheduled-publication.enabled=false",
        "novel.author-application.rejection-cooldown=PT48H",
        "spring.datasource.url=jdbc:h2:mem:author_cooldown_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorApplicationCooldownIntegrationTest {
    private static final String INTERNAL_KEY = "author-cooldown-test-internal-key";

    @Autowired AuthService authService;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired NovelStore store;

    @Test
    void rejectionMaterializesConfiguredBoundaryBlocksResubmissionAndAllowsItAfterExpiry() throws Exception {
        AuthService.AuthenticatedSession session = authService.register(
                "author.cooldown@example.test",
                "冷却期申请人",
                "correct-horse-battery-staple");
        AuthorApplication pending = store.applyAuthor(session.user().id(), "北辰", "计划持续创作长篇科幻作品。");

        Instant beforeDecision = Instant.now();
        mvc.perform(post("/api/v1/admin/author-applications/{id}", pending.id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":false,\"reason\":\"请先补充完整创作计划\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REJECTED"))
                .andExpect(jsonPath("$.data.reapplyAvailableAt").isNotEmpty());
        Instant afterDecision = Instant.now();

        Instant persistedBoundary = jdbc.queryForObject(
                "SELECT reapply_available_at FROM novel_author_application WHERE id = ?",
                Timestamp.class,
                pending.id()).toInstant();
        assertThat(persistedBoundary)
                .isBetween(
                        beforeDecision.plus(Duration.ofHours(48)).minusSeconds(1),
                        afterDecision.plus(Duration.ofHours(48)).plusSeconds(1));

        mvc.perform(get("/api/v1/account/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REJECTED"))
                .andExpect(jsonPath("$.data.reapplyAvailableAt").isNotEmpty());
        mvc.perform(post("/api/v1/account/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"penName\":\"北辰\",\"statement\":\"冷却期内的重复提交。\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.msg").value(startsWith("author application can be resubmitted after ")));

        // V28 intentionally leaves pre-policy rows nullable. They still observe the configured
        // boundary through the decided timestamp until a later decision writes a materialized one.
        jdbc.update("UPDATE novel_author_application SET reapply_available_at = NULL WHERE id = ?", pending.id());
        mvc.perform(get("/api/v1/account/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reapplyAvailableAt").isNotEmpty());
        mvc.perform(post("/api/v1/account/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"penName\":\"北辰\",\"statement\":\"旧决定的冷却期内重提。\"}"))
                .andExpect(status().isConflict());

        jdbc.update(
                "UPDATE novel_author_application SET reapply_available_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(1)),
                pending.id());
        mvc.perform(post("/api/v1/account/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"penName\":\"北辰二世\",\"statement\":\"冷却期结束后重新提交完整创作计划。\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING"));
    }

    @Test
    void approvalDoesNotExposeAReapplicationBoundary() throws Exception {
        AuthService.AuthenticatedSession session = authService.register(
                "approved.author@example.test",
                "通过申请人",
                "correct-horse-battery-staple");
        AuthorApplication pending = store.applyAuthor(session.user().id(), "星河", "已准备好开始稳定连载。");

        mvc.perform(post("/api/v1/admin/author-applications/{id}", pending.id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"材料完整，审核通过\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.reapplyAvailableAt").value(nullValue()));
        assertThat(jdbc.queryForObject(
                "SELECT reapply_available_at FROM novel_author_application WHERE id = ?",
                Timestamp.class,
                pending.id())).isNull();
    }
}
