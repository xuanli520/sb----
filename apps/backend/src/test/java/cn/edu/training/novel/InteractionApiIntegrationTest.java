package cn.edu.training.novel;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:interaction_api_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class InteractionApiIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired WebApplicationContext context;
    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .build();
    }

    @Test
    void publicReadersSeeOnlyVisibleCommentsWhileOwnersAuthorsAndAdminsHaveScopedReviewViews() throws Exception {
        String pendingBody = mvc.perform(post("/api/v1/account/books/1/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chapterId\":1001,\"content\":\"含敏感词的章节评论\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"))
                .andReturn().getResponse().getContentAsString();
        long pendingId = ((Number) JsonPath.read(pendingBody, "$.data.id")).longValue();

        mvc.perform(post("/api/v1/account/books/1/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"公开书评\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("VISIBLE"));

        mvc.perform(get("/api/v1/public/books/1/comments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].content").value("公开书评"));
        mvc.perform(get("/api/v1/account/comments").param("status", "PENDING_REVIEW"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(pendingId));
        mvc.perform(get("/api/v1/account/comments")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));

        mvc.perform(get("/api/v1/author/books/1/comments"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/author/books/2/comments")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/author/books/1/comments")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("status", "PENDING_REVIEW"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1));

        mvc.perform(get("/api/v1/admin/comments").param("status", "PENDING_REVIEW"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/comments/{commentId}/review", pendingId)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"人工审核通过\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("VISIBLE"));

        String rejectedBody = mvc.perform(post("/api/v1/account/books/1/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"含敏感词的待驳回评论\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"))
                .andReturn().getResponse().getContentAsString();
        long rejectedId = ((Number) JsonPath.read(rejectedBody, "$.data.id")).longValue();
        mvc.perform(post("/api/v1/admin/comments/{commentId}/review", rejectedId)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":false,\"reason\":\"不符合社区规范\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REJECTED"));
        mvc.perform(get("/api/v1/public/books/1/comments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].content").value("公开书评"));
        mvc.perform(get("/api/v1/public/books/1/comments").param("chapterId", "1001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(pendingId));
        mvc.perform(get("/api/v1/account/comments").param("status", "REJECTED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(rejectedId));
        mvc.perform(get("/api/v1/public/books/1/interactions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.visibleCommentCount").value(2));
    }

    @Test
    void interactionWritesRejectMissingOrCrossBookTargetsAndDuplicateVotes() throws Exception {
        mvc.perform(post("/api/v1/account/books/999/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"不存在的作品\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/account/books/1/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chapterId\":1002,\"content\":\"跨书章节\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/account/books/999/rating")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/account/books/1/votes/unsupported"))
                .andExpect(status().isNotFound());

        mvc.perform(post("/api/v1/account/books/1/votes/recommendation"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(1));
        mvc.perform(post("/api/v1/account/books/1/votes/recommendation"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/account/books/1/votes/monthly"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.count").value(1));

        MockMvc unauthenticated = MockMvcBuilders.webAppContextSetup(context).build();
        unauthenticated.perform(get("/api/v1/account/comments"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void authorsCanGiveAuditedAdviceForTheirOwnPendingCommentsWithoutMakingTheFinalVisibilityDecision() throws Exception {
        String pendingBody = mvc.perform(post("/api/v1/account/books/1/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chapterId\":1001,\"content\":\"含敏感词的待处理章评\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"))
                .andReturn().getResponse().getContentAsString();
        long commentId = ((Number) JsonPath.read(pendingBody, "$.data.id")).longValue();

        mvc.perform(post("/api/v1/author/books/1/comments/{commentId}/moderation-advice", commentId)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recommendVisible\":false,\"reason\":\"建议站长按社区规范驳回\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recommendation").value("RECOMMEND_REJECTED"))
                .andExpect(jsonPath("$.data.reason").value("建议站长按社区规范驳回"));

        mvc.perform(get("/api/v1/author/books/1/comments")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .param("status", "PENDING_REVIEW"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(commentId))
                .andExpect(jsonPath("$.data.items[0].status").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.data.items[0].authorModerationAdvice.recommendation").value("RECOMMEND_REJECTED"));
        mvc.perform(get("/api/v1/public/books/1/comments").param("chapterId", "1001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));

        mvc.perform(post("/api/v1/author/books/2/comments/{commentId}/moderation-advice", commentId)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recommendVisible\":true,\"reason\":\"越权尝试\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/author/books/1/comments/{commentId}/moderation-advice", commentId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recommendVisible\":true,\"reason\":\"读者不能建议\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/admin/comments/{commentId}/review", commentId)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"站长复核后允许公开\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("VISIBLE"));
        mvc.perform(get("/api/v1/public/books/1/comments").param("chapterId", "1001"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1));
    }
}
