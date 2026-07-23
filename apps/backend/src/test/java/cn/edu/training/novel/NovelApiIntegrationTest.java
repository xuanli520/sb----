package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import cn.edu.training.novel.service.AuthService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:novel_api_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
}) @AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class NovelApiIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";
    private static final String DEVELOPMENT_PRINCIPAL = "X-Novel-Development-Principal";

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthService authService;
    MockMvc mvc;
    MockMvc internalMvc;
    @BeforeEach void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                // Every development fixture carries an explicit development identity. This keeps
                // tests from accidentally accepting an internal-key-only request as a reader.
                .defaultRequest(get("/")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "reader"))
                .build();
        internalMvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").header("X-Novel-Internal-Key", INTERNAL_KEY))
                .build();
    }
    @Test void publicDiscoverySearchesAndReadsPublishedBook() throws Exception {
        mvc.perform(get("/api/v1/public/books").param("q","星海"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].title").value("星海拾光"));
        mvc.perform(get("/api/v1/public/books/1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.chapters[0].content").exists());
    }
    @Test void directProtectedApiCannotForgeIdentityWithoutBffKey() throws Exception {
        MockMvc direct = MockMvcBuilders.webAppContextSetup(context).build();
        direct.perform(get("/api/v1/admin/dashboard").header("X-Novel-Principal", "admin"))
                .andExpect(status().isUnauthorized());
    }
    @Test void developmentIdentityMustBeExplicitEvenWhenDevelopmentAuthIsEnabled() throws Exception {
        MockMvc direct = MockMvcBuilders.webAppContextSetup(context).build();
        direct.perform(get("/api/v1/account/profile").header("X-Novel-Internal-Key", INTERNAL_KEY))
                .andExpect(status().isUnauthorized());
        direct.perform(get("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "reader"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles[0]").value("READER"));
    }
    @Test void passwordAccountUsesOpaqueBffSessionAndServerSideRoles() throws Exception {
        String password = "correct-horse-battery-staple";
        AuthService.AuthenticatedSession account = authService.register("reader@example.test", "真实读者", password);
        String sessionId = account.bffSessionId();
        String storedHash = jdbc.queryForObject("SELECT password_hash FROM novel_account WHERE login_name = ?", String.class, "reader@example.test");
        assertThat(storedHash).startsWith("$2").isNotEqualTo(password);

        internalMvc.perform(get("/api/v1/account/profile").header("X-Novel-Bff-Session", sessionId).header("X-Novel-Principal", "admin"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("真实读者"))
                .andExpect(jsonPath("$.data.roles[0]").value("READER"));
        internalMvc.perform(get("/api/v1/author/books").header("X-Novel-Bff-Session", sessionId).header("X-Novel-Principal", "admin"))
                .andExpect(status().isForbidden());
        internalMvc.perform(get("/api/v1/admin/dashboard").header("X-Novel-Bff-Session", sessionId).header("X-Novel-Principal", "admin"))
                .andExpect(status().isForbidden());
        internalMvc.perform(post("/api/v1/auth/logout").header("X-Novel-Bff-Session", sessionId)).andExpect(status().isOk());
        internalMvc.perform(get("/api/v1/account/profile").header("X-Novel-Bff-Session", sessionId)).andExpect(status().isUnauthorized());
        internalMvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"reader@example.test\",\"password\":\"incorrect-password\"}"))
                .andExpect(status().isUnauthorized());
    }
    @Test void readerCanManageShelfAndOneTimeRedemptionIsAudited() throws Exception {
        mvc.perform(post("/api/v1/account/bookshelf/1")).andExpect(status().isOk()).andExpect(jsonPath("$.data.saved").value(true));
        mvc.perform(get("/api/v1/account/bookshelf"))
                .andExpect(jsonPath("$.data.items[0].id").value(1))
                .andExpect(jsonPath("$.data.meta.total").value(1));
        mvc.perform(post("/api/v1/account/checkin"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.points").value(10)).andExpect(jsonPath("$.data.awarded").value(10));
        mvc.perform(post("/api/v1/account/checkin")).andExpect(status().isConflict());
        mvc.perform(post("/api/v1/account/redeem").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"WELCOME100\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.tokens").value(100));
        mvc.perform(post("/api/v1/account/redeem").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"WELCOME100\"}"))
            .andExpect(status().isConflict());
    }
    @Test void roleAndOwnershipProtectAuthorWorkflow() throws Exception {
        mvc.perform(get("/api/v1/author/books").header(DEVELOPMENT_PRINCIPAL, "reader")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/author/books").header(DEVELOPMENT_PRINCIPAL,"author").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"测试书\",\"category\":\"科幻\",\"synopsis\":\"测试简介\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("DRAFT"));
        mvc.perform(post("/api/v1/author/books/2/chapters").header(DEVELOPMENT_PRINCIPAL,"author").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"越权\",\"content\":\"内容\",\"submit\":true}"))
            .andExpect(status().isForbidden());
    }
    @Test void adminReviewControlsVisibility() throws Exception {
        String payload="{\"title\":\"待审书\",\"category\":\"悬疑\",\"synopsis\":\"待审核\"}";
        String body=mvc.perform(post("/api/v1/author/books").header(DEVELOPMENT_PRINCIPAL,"author").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(body).contains("待审书");
        mvc.perform(get("/api/v1/admin/reviews").header(DEVELOPMENT_PRINCIPAL,"admin")).andExpect(status().isOk());
    }

    @Test void readerPreferencesProgressBookmarksAndInteractionsRespectContracts() throws Exception {
        mvc.perform(put("/api/v1/account/preferences/reading").contentType(MediaType.APPLICATION_JSON).content("{\"theme\":\"night\",\"font\":\"serif\",\"fontSize\":22,\"lineHeight\":200,\"brightness\":70,\"pageMode\":\"cover\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.theme").value("night"));
        mvc.perform(put("/api/v1/account/progress").contentType(MediaType.APPLICATION_JSON).content("{\"bookId\":1,\"chapterId\":1001,\"offset\":12}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.offset").value(12));
        mvc.perform(post("/api/v1/account/books/1/bookmarks").contentType(MediaType.APPLICATION_JSON).content("{\"chapterId\":1001,\"offset\":12,\"note\":\"线索\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.note").value("线索"));
        mvc.perform(post("/api/v1/account/books/1/rating").contentType(MediaType.APPLICATION_JSON).content("{\"rating\":5}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.average").value(5.0));
        mvc.perform(post("/api/v1/account/books/1/votes/recommendation")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/account/books/1/votes/recommendation")).andExpect(status().isConflict());
    }

    @Test void redemptionFundsPurchaseAndRewardAtomically() throws Exception {
        mvc.perform(post("/api/v1/account/redeem").header("X-Novel-Development-Principal","author").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"WELCOME100\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/account/books/1/purchase").header("X-Novel-Development-Principal","author").contentType(MediaType.APPLICATION_JSON).content("{\"amount\":30}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.balance").value(70));
        mvc.perform(post("/api/v1/account/books/1/reward").header("X-Novel-Development-Principal","author").header("Idempotency-Key", "novel-api-reward").contentType(MediaType.APPLICATION_JSON).content("{\"amount\":20}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.balance").value(50));
        mvc.perform(get("/api/v1/account/wallet").header("X-Novel-Development-Principal","author")).andExpect(jsonPath("$.data.tokens").value(50));
    }

    @Test void sensitiveContentQueuesCommentAndChapterForManualReview() throws Exception {
        mvc.perform(post("/api/v1/account/books/1/comments").contentType(MediaType.APPLICATION_JSON).content("{\"content\":\"含敏感词的评论\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"));
        mvc.perform(post("/api/v1/author/books/1/chapters").header("X-Novel-Development-Principal","author").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"风险章节\",\"content\":\"包含敏感词\",\"submit\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.published").value(false));
        mvc.perform(get("/api/v1/admin/reviews/queue")
                        .param("scope", "NEW_CHAPTER")
                        .header("X-Novel-Development-Principal","admin"))
                .andExpect(jsonPath("$.data.items[0].book.id").value(1));
    }

    @Test void adminCanInspectAuthorApplicationAndDisableUser() throws Exception {
        mvc.perform(post("/api/v1/account/author-applications").contentType(MediaType.APPLICATION_JSON).content("{\"penName\":\"新作者\",\"statement\":\"提交创作申请\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING"));
        mvc.perform(get("/api/v1/admin/author-applications").header("X-Novel-Development-Principal","admin")).andExpect(jsonPath("$.data[0].penName").value("新作者"));
        AuthService.AuthenticatedSession registered = authService.register(
                "disable.target@example.test", "待禁用读者", "correct-horse-battery-staple");
        long accountId = registered.user().id();
        String sessionId = registered.bffSessionId();
        mvc.perform(post("/api/v1/admin/users/{userId}/status", accountId)
                        .header("X-Novel-Development-Principal","admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false,\"reason\":\"违规处理暂停账号\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false));
        assertThat(jdbc.queryForObject("SELECT enabled FROM novel_account WHERE id = ?", Boolean.class, accountId)).isFalse();
        internalMvc.perform(get("/api/v1/account/profile").header("X-Novel-Bff-Session", sessionId))
                .andExpect(status().isUnauthorized());
    }
}
