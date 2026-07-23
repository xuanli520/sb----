package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AdminOperationsService;
import cn.edu.training.novel.service.AuthService;
import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:admin_operations_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AdminOperationsIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired AdminOperationsService adminOperationsService;
    @Autowired JdbcTemplate jdbc;

    @Test
    void administratorCanFilterSuspendAuditAndReactivateAccountWithoutRestoringOldSession() throws Exception {
        AuthService.AuthenticatedSession target = authService.register(
                "managed.reader@example.test",
                "运营管理读者",
                "correct-horse-battery-staple");

        mvc.perform(get("/api/v1/admin/accounts")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER)
                        .param("query", "管理读者"))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/admin/accounts")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .param("query", "managed.reader")
                        .param("status", "ENABLED")
                        .param("role", "READER")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(target.user().id()))
                .andExpect(jsonPath("$.data.items[0].loginName").value("managed.reader@example.test"))
                .andExpect(jsonPath("$.data.items[0].enabled").value(true));

        mvc.perform(post("/api/v1/admin/accounts/{accountId}/status", target.user().id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false,\"reason\":\"重复发布违规内容，暂停账号\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.changed").value(true))
                .andExpect(jsonPath("$.data.account.enabled").value(false))
                .andExpect(jsonPath("$.data.audit.previousEnabled").value(true))
                .andExpect(jsonPath("$.data.audit.enabled").value(false))
                .andExpect(jsonPath("$.data.audit.operatorUserId").value(1))
                .andExpect(jsonPath("$.data.audit.reason").value("重复发布违规内容，暂停账号"));

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_login_session WHERE account_id = ? AND revoked_at IS NOT NULL",
                Integer.class,
                target.user().id())).isEqualTo(1);
        mvc.perform(get("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", target.bffSessionId()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/login")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"managed.reader@example.test\",\"password\":\"correct-horse-battery-staple\"}"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/v1/admin/accounts")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .param("status", "SUSPENDED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(target.user().id()));
        mvc.perform(get("/api/v1/admin/accounts/{accountId}/status-audits", target.user().id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .param("page", "0")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(1))
                .andExpect(jsonPath("$.data.items[0].reason").value("重复发布违规内容，暂停账号"))
                .andExpect(jsonPath("$.data.items[0].operatorUserId").value(1));

        mvc.perform(post("/api/v1/admin/users/{accountId}/status", target.user().id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true,\"reason\":\"申诉复核通过，恢复账号\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.changed").value(true))
                .andExpect(jsonPath("$.data.account.enabled").value(true));

        // Reactivation never revives a revoked opaque token; the reader must authenticate again.
        mvc.perform(get("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", target.bffSessionId()))
                .andExpect(status().isUnauthorized());
        String newLogin = mvc.perform(post("/api/v1/auth/login")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"managed.reader@example.test\",\"password\":\"correct-horse-battery-staple\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        String replacementSession = JsonPath.read(newLogin, "$.data.sessionId");
        mvc.perform(get("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", replacementSession))
                .andExpect(status().isOk());
    }

    @Test
    void taxonomyIsAdminManagedAuditedAndOnlyEnabledItemsReachPublicDiscovery() throws Exception {
        mvc.perform(get("/api/v1/admin/taxonomy/CATEGORY")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/public/taxonomy/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].name").value("科幻"));

        String creation = mvc.perform(post("/api/v1/admin/taxonomy/TAG")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"悬念\",\"enabled\":true,\"sortOrder\":12}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.type").value("TAG"))
                .andExpect(jsonPath("$.data.name").value("悬念"))
                .andReturn().getResponse().getContentAsString();
        Number tagId = JsonPath.read(creation, "$.data.id");

        mvc.perform(get("/api/v1/public/taxonomy/tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].name").value("悬念"));
        mvc.perform(put("/api/v1/admin/taxonomy/TAG/{tagId}", tagId.longValue())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"悬念\",\"enabled\":false,\"sortOrder\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.data.sortOrder").value(3));
        mvc.perform(get("/api/v1/public/taxonomy/tags"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isEmpty());
        mvc.perform(get("/api/v1/admin/taxonomy/TAG/audits")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].action").value("UPDATED"))
                .andExpect(jsonPath("$.data[0].operatorUserId").value(1));

        mvc.perform(post("/api/v1/admin/taxonomy/CATEGORY")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"科幻\",\"enabled\":true,\"sortOrder\":100}"))
                .andExpect(status().isConflict());
    }

    @Test
    void administratorCanInspectARegisteredUsersRedactedPagedBehaviorTimeline() throws Exception {
        AuthService.AuthenticatedSession target = authService.register(
                "behavior.reader@example.test",
                "行为查询读者",
                "correct-horse-battery-staple");
        long accountId = target.user().id();

        jdbc.update("INSERT INTO novel_reader_progress(user_id, book_id, chapter_id, character_offset, updated_at) "
                + "VALUES (?, 1, 1001, 12, CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_reader_bookshelf(user_id, book_id, added_at) VALUES (?, 1, CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_reader_daily_checkin(user_id, checkin_date, awarded_points, created_at) "
                + "VALUES (?, CURRENT_DATE, 10, CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_reader_bookmark(user_id, book_id, chapter_id, character_offset, note, created_at) "
                + "VALUES (?, 1, 1001, 12, '仅读者本人可见的书签备注', CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_book_entitlement(user_id, book_id, source_type, source_reference, purchase_amount, acquired_at) "
                + "VALUES (?, 1, 'PURCHASE', '1', 30, CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, book_id, membership_days, status, "
                + "redeemed_by_user_id, redeemed_at, created_at, updated_at) "
                + "VALUES ('SECRET-BEHAVIOR-CODE', 'behavior-test', 'TOKEN', 100, NULL, 0, 'REDEEMED', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                accountId);
        jdbc.update("INSERT INTO novel_reward_record(rewarder_user_id, author_id, book_id, amount, created_at) "
                + "VALUES (?, 2, 1, 20, CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_comment(book_id, chapter_id, user_id, author_name, content, status, created_at, updated_at) "
                + "VALUES (1, 1001, ?, '行为查询读者', '不应通过行为时间线暴露的评论正文', 'VISIBLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                accountId);
        jdbc.update("INSERT INTO novel_paragraph_annotation(book_id, chapter_id, user_id, author_name, paragraph_index, selection_start, "
                + "selection_end, selected_text, note, share_intent, status, created_at, updated_at) "
                + "VALUES (1, 1001, ?, '行为查询读者', 0, 0, 4, '不应暴露的划线原文', '不应暴露的划线备注', FALSE, 'PRIVATE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                accountId);
        jdbc.update("INSERT INTO novel_book_rating(book_id, user_id, rating, created_at, updated_at) "
                + "VALUES (1, ?, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_book_vote(book_id, user_id, vote_type, created_at) "
                + "VALUES (1, ?, 'recommendation', CURRENT_TIMESTAMP)", accountId);
        jdbc.update("INSERT INTO novel_reader_activity_event(user_id, book_id, chapter_id, event_type, activity_date, occurred_at) "
                + "VALUES (?, 1, 1001, 'READING_PROGRESS', CURRENT_DATE, CURRENT_TIMESTAMP)", accountId);

        mvc.perform(get("/api/v1/admin/accounts/{accountId}/behavior-summary", accountId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/accounts/{accountId}/behavior-events", accountId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/admin/accounts/{accountId}/behavior-summary", accountId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.account.id").value(accountId))
                .andExpect(jsonPath("$.data.readingProgressCount").value(1))
                .andExpect(jsonPath("$.data.bookshelfCount").value(1))
                .andExpect(jsonPath("$.data.checkinCount").value(1))
                .andExpect(jsonPath("$.data.bookmarkCount").value(1))
                .andExpect(jsonPath("$.data.bookPurchaseCount").value(1))
                .andExpect(jsonPath("$.data.redeemedCodeCount").value(1))
                .andExpect(jsonPath("$.data.rewardCount").value(1))
                .andExpect(jsonPath("$.data.commentCount").value(1))
                .andExpect(jsonPath("$.data.annotationCount").value(1))
                .andExpect(jsonPath("$.data.ratingCount").value(1))
                .andExpect(jsonPath("$.data.voteCount").value(1))
                .andExpect(jsonPath("$.data.readerActivityCount").value(1))
                .andExpect(jsonPath("$.data.lastReaderActivityAt").isNotEmpty());

        String firstPage = mvc.perform(get("/api/v1/admin/accounts/{accountId}/behavior-events", accountId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .param("page", "0")
                        .param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(12))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(2))
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andReturn().getResponse().getContentAsString();
        String completeTimeline = mvc.perform(get("/api/v1/admin/accounts/{accountId}/behavior-events", accountId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .param("page", "0")
                        .param("size", "100"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(firstPage).doesNotContain("SECRET-BEHAVIOR-CODE");
        assertThat(completeTimeline)
                .contains("READING_PROGRESS", "BOOKSHELF_ADDED", "CHECKIN", "BOOK_PURCHASE", "REDEMPTION",
                        "REWARD_SENT", "COMMENT_SUBMITTED", "READING_ACTIVITY")
                .doesNotContain("SECRET-BEHAVIOR-CODE", "不应通过行为时间线暴露的评论正文", "不应暴露的划线原文", "不应暴露的划线备注", "仅读者本人可见的书签备注");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE ?", Integer.class,
                "%account-behavior-summary operator=1 account=" + accountId + "%")).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE ?", Integer.class,
                "%account-behavior-events operator=1 account=" + accountId + "%")).isEqualTo(2);

        mvc.perform(get("/api/v1/admin/accounts/999999/behavior-summary")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isNotFound());
    }

    @Test
    void fixedOrderAdminLocksPreserveOneEnabledAdministratorUnderConcurrentSuspensions() throws Exception {
        long firstAdmin = registerAdministrator("first.admin@example.test", "第一管理员");
        long secondAdmin = registerAdministrator("second.admin@example.test", "第二管理员");

        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Boolean>> results = new ArrayList<>();
            results.add(workers.submit(() -> suspendWhenReleased(firstAdmin, ready, start)));
            results.add(workers.submit(() -> suspendWhenReleased(secondAdmin, ready, start)));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();

            long successes = 0;
            for (Future<Boolean> result : results) {
                if (result.get(10, TimeUnit.SECONDS)) {
                    successes++;
                }
            }
            // The persisted test-session administrator remains enabled, so both newly created
            // administrators may be suspended without violating the one-admin invariant.
            assertThat(successes).isEqualTo(2);
        } finally {
            start.countDown();
            workers.shutdownNow();
            assertThat(workers.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE enabled = TRUE AND roles LIKE '%ADMIN%'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account_status_audit WHERE enabled = FALSE",
                Integer.class)).isEqualTo(2);
    }

    private long registerAdministrator(String loginName, String displayName) {
        AuthService.AuthenticatedSession account = authService.register(
                loginName,
                displayName,
                "correct-horse-battery-staple");
        authService.grantRole(account.user().id(), Role.ADMIN);
        return account.user().id();
    }

    private boolean suspendWhenReleased(long accountId, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("concurrent suspension did not start");
            }
            adminOperationsService.changeAccountStatus(1L, accountId, false, "并发封禁测试");
            return true;
        } catch (IllegalStateException expected) {
            return false;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError("concurrent suspension was interrupted", exception);
        }
    }
}
