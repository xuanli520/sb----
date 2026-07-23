package cn.edu.training.novel;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.AuthService;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * FR-05 permission matrix.  The test intentionally uses fresh persisted accounts rather than a
 * browser-provided role header for reader entitlements, then proves the development author/admin
 * identities retain their management access.
 */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=reader-entitlement-test-internal-key",
        "novel.scheduled-publication.enabled=false",
        "novel.auth.bcrypt-strength=4",
        "spring.datasource.url=jdbc:h2:mem:reading_entitlement_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ReadingEntitlementIntegrationTest {
    private static final String INTERNAL_KEY = "reader-entitlement-test-internal-key";
    private static final long BOOK_ID = 1L;
    private static final long PREVIEW_CHAPTER_ID = 1001L;
    private static final long LOCKED_CHAPTER_ID = 2001L;
    private static final String LOCKED_BODY = "受限章节正文，只有持有权益的读者可见。";
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Autowired WebApplicationContext context;
    @Autowired AuthService authService;
    @Autowired JdbcTemplate jdbc;
    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/").header("X-Novel-Internal-Key", INTERNAL_KEY))
                .build();
        addSecondPublishedChapter();
    }

    @Test
    void anonymousAndUnentitledReadersReceiveOnlyPreviewMetadataAndCannotUseExcerptSideChannels() throws Exception {
        AuthService.AuthenticatedSession reader = register("locked.reader@example.test", "未购读者");

        mvc.perform(get("/api/v1/public/books/{bookId}", BOOK_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.fullBookAccess").value(false))
                .andExpect(jsonPath("$.data.chapters[0].id").value(PREVIEW_CHAPTER_ID))
                .andExpect(jsonPath("$.data.chapters[0].content").isNotEmpty())
                .andExpect(jsonPath("$.data.chapters[0].readable").value(true))
                .andExpect(jsonPath("$.data.chapters[1].id").value(LOCKED_CHAPTER_ID))
                .andExpect(jsonPath("$.data.chapters[1].content").value(nullValue()))
                .andExpect(jsonPath("$.data.chapters[1].readable").value(false))
                .andExpect(jsonPath("$.data.chapters[1].access").value("ENTITLEMENT_REQUIRED"))
                .andExpect(content().string(not(containsString(LOCKED_BODY))));

        mvc.perform(account(get("/api/v1/account/books/{bookId}/reading", BOOK_ID), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.fullBookAccess").value(false))
                .andExpect(jsonPath("$.data.chapters[1].content").value(nullValue()))
                .andExpect(content().string(not(containsString(LOCKED_BODY))));

        mvc.perform(account(put("/api/v1/account/progress")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":1,\"chapterId\":2001,\"offset\":0}"), reader))
                .andExpect(status().isForbidden());
        mvc.perform(account(post("/api/v1/account/books/{bookId}/bookmarks", BOOK_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chapterId\":2001,\"offset\":0,\"note\":\"不应保存\"}"), reader))
                .andExpect(status().isForbidden());
        mvc.perform(account(post("/api/v1/account/books/{bookId}/comments", BOOK_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chapterId\":2001,\"content\":\"不应评论锁定章节\"}"), reader))
                .andExpect(status().isForbidden());
        mvc.perform(account(post("/api/v1/account/books/{bookId}/chapters/{chapterId}/annotations", BOOK_ID, LOCKED_CHAPTER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paragraphIndex\":0,\"selectionStart\":0,\"selectionEnd\":4,\"selectedText\":\"受限章节\",\"shareIntent\":true}"), reader))
                .andExpect(status().isForbidden());

        // Publicly approved annotation excerpts are subject to the same preview boundary.
        mvc.perform(get("/api/v1/public/books/{bookId}/chapters/{chapterId}/annotations", BOOK_ID, LOCKED_CHAPTER_ID))
                .andExpect(status().isForbidden())
                .andExpect(content().string(not(containsString("受限章节"))));
    }

    @Test
    void purchaseGrantsImmediateWholeBookAccessOnlyToThePurchasingAccountAndKeepsPublicExcerptLocked() throws Exception {
        AuthService.AuthenticatedSession buyer = register("buyer@example.test", "购书读者");
        AuthService.AuthenticatedSession bystander = register("bystander@example.test", "旁观读者");

        mvc.perform(account(post("/api/v1/account/redeem")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"WELCOME100\"}"), buyer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.balance").value(100));
        mvc.perform(account(post("/api/v1/account/books/{bookId}/purchase", BOOK_ID), buyer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.purchased").value(true))
                .andExpect(jsonPath("$.data.balance").value(70));
        mvc.perform(account(post("/api/v1/account/books/{bookId}/comments", BOOK_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"chapterId\":2001,\"content\":\"锁定章节讨论仅限权益读者\"}"), buyer))
                .andExpect(status().isOk());

        mvc.perform(account(get("/api/v1/account/books/{bookId}/reading", BOOK_ID), buyer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.fullBookAccess").value(true))
                .andExpect(jsonPath("$.data.access.source").value("BOOK_ENTITLEMENT"))
                .andExpect(jsonPath("$.data.chapters[1].readable").value(true))
                .andExpect(jsonPath("$.data.chapters[1].content").value(LOCKED_BODY))
                .andExpect(jsonPath("$.data.comments[0].content").value("锁定章节讨论仅限权益读者"));
        mvc.perform(account(put("/api/v1/account/progress")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":1,\"chapterId\":2001,\"offset\":3}"), buyer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chapterId").value(LOCKED_CHAPTER_ID));

        mvc.perform(account(get("/api/v1/account/books/{bookId}/reading", BOOK_ID), bystander))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.fullBookAccess").value(false))
                .andExpect(jsonPath("$.data.chapters[1].content").value(nullValue()))
                .andExpect(jsonPath("$.data.comments").isEmpty())
                .andExpect(content().string(not(containsString(LOCKED_BODY))));
        mvc.perform(get("/api/v1/public/books/{bookId}", BOOK_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.comments").isEmpty())
                .andExpect(content().string(not(containsString("锁定章节讨论仅限权益读者"))));
        mvc.perform(get("/api/v1/public/books/{bookId}/comments", BOOK_ID)
                        .param("chapterId", Long.toString(LOCKED_CHAPTER_ID)))
                .andExpect(status().isForbidden());
        mvc.perform(account(get("/api/v1/account/books/{bookId}/comments", BOOK_ID)
                        .param("chapterId", Long.toString(LOCKED_CHAPTER_ID)), bystander))
                .andExpect(status().isForbidden());
        mvc.perform(account(get("/api/v1/account/books/{bookId}/comments", BOOK_ID)
                        .param("chapterId", Long.toString(LOCKED_CHAPTER_ID)), buyer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].content").value("锁定章节讨论仅限权益读者"));

        // Even after an entitled reader submits an excerpt, the anonymous public endpoint cannot
        // turn it into a body-recovery channel for a locked chapter.
        String annotationBody = mvc.perform(account(post("/api/v1/account/books/{bookId}/chapters/{chapterId}/annotations", BOOK_ID, LOCKED_CHAPTER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paragraphIndex\":0,\"selectionStart\":0,\"selectionEnd\":4,\"selectedText\":\"受限章节\",\"note\":\"权益后的可见划线\",\"shareIntent\":true}"), buyer))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long annotationId = ((Number) com.jayway.jsonpath.JsonPath.read(annotationBody, "$.data.id")).longValue();
        mvc.perform(post("/api/v1/admin/annotations/{annotationId}/review", annotationId)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"审核通过\"}"))
                .andExpect(status().isOk());
        mvc.perform(account(get("/api/v1/account/books/{bookId}/chapters/{chapterId}/annotations", BOOK_ID, LOCKED_CHAPTER_ID), bystander))
                .andExpect(status().isForbidden());
        mvc.perform(account(get("/api/v1/account/books/{bookId}/chapters/{chapterId}/annotations", BOOK_ID, LOCKED_CHAPTER_ID), buyer))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].selectedText").value("受限章节"))
                .andExpect(jsonPath("$.data.items[0].userId").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].status").doesNotExist());
        mvc.perform(get("/api/v1/public/books/{bookId}/chapters/{chapterId}/annotations", BOOK_ID, LOCKED_CHAPTER_ID))
                .andExpect(status().isForbidden())
                .andExpect(content().string(not(containsString("受限章节"))));
    }

    @Test
    void redemptionMembershipAuthorAndAdministratorEachReceiveTheDocumentedFullBookAccess() throws Exception {
        AuthService.AuthenticatedSession redeemedReader = register("redeemed.reader@example.test", "兑换读者");
        AuthService.AuthenticatedSession member = register("member.reader@example.test", "会员读者");
        AuthService.AuthenticatedSession expiredMember = register("expired.reader@example.test", "过期会员");
        insertBookRedemptionCode("BOOK-ONLY-ENTITLEMENT", BOOK_ID);
        jdbc.update(
                "INSERT INTO novel_membership_entitlement(user_id, expires_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                member.user().id(),
                Timestamp.from(Instant.now().plusSeconds(86_400)));
        jdbc.update(
                "INSERT INTO novel_membership_entitlement(user_id, expires_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                expiredMember.user().id(),
                Timestamp.from(Instant.now().minusSeconds(1)));

        mvc.perform(account(post("/api/v1/account/redeem")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"BOOK-ONLY-ENTITLEMENT\"}"), redeemedReader))
                .andExpect(status().isOk());
        mvc.perform(account(get("/api/v1/account/books/{bookId}/reading", BOOK_ID), redeemedReader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.source").value("BOOK_ENTITLEMENT"))
                .andExpect(jsonPath("$.data.chapters[1].content").value(LOCKED_BODY));
        mvc.perform(account(get("/api/v1/account/books/{bookId}/reading", BOOK_ID), member))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.source").value("MEMBERSHIP"))
                .andExpect(jsonPath("$.data.chapters[1].content").value(LOCKED_BODY));
        mvc.perform(account(get("/api/v1/account/books/{bookId}/reading", BOOK_ID), expiredMember))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.fullBookAccess").value(false))
                .andExpect(jsonPath("$.data.chapters[1].content").value(nullValue()));

        mvc.perform(get("/api/v1/account/books/{bookId}/reading", BOOK_ID)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.source").value("AUTHOR"))
                .andExpect(jsonPath("$.data.chapters[1].content").value(LOCKED_BODY));
        mvc.perform(get("/api/v1/account/books/{bookId}/reading", BOOK_ID)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.access.source").value("ADMIN"))
                .andExpect(jsonPath("$.data.chapters[1].content").value(LOCKED_BODY));
    }

    private AuthService.AuthenticatedSession register(String login, String displayName) {
        return authService.register(login, displayName, PASSWORD);
    }

    private MockHttpServletRequestBuilder account(
            MockHttpServletRequestBuilder request,
            AuthService.AuthenticatedSession session) {
        return request.header("X-Novel-Bff-Session", session.bffSessionId());
    }

    private void addSecondPublishedChapter() {
        jdbc.update(
                "INSERT INTO novel_chapter(id, book_id, volume_id, title, content, published, status, scheduled_publish_at, published_at, review_reason, order_no) "
                        + "VALUES (?, ?, NULL, ?, ?, TRUE, 'PUBLISHED', NULL, CURRENT_TIMESTAMP, '', ?)",
                LOCKED_CHAPTER_ID,
                BOOK_ID,
                "第二章 权益门槛",
                LOCKED_BODY,
                2);
    }

    private void insertBookRedemptionCode(String code, long bookId) {
        jdbc.update(
                "INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, book_id, membership_days, status, expires_at, redeemed_by_user_id, redeemed_at, created_at, updated_at) "
                        + "VALUES (?, 'ENTITLEMENT-TEST', 'BOOK', 0, ?, 0, 'ACTIVE', NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                code,
                bookId);
    }
}
