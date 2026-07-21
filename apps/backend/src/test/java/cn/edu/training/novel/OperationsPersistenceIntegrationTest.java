package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.AuthorApplication;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.Comment;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AuditTrail;
import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.ContentModerationService;
import cn.edu.training.novel.service.ContentModerationReviewService;
import cn.edu.training.novel.service.InteractionRepository;
import cn.edu.training.novel.service.NovelStore;
import cn.edu.training.novel.service.OperationsRepository;
import cn.edu.training.novel.service.ReaderRepository;
import cn.edu.training.novel.service.WalletRepository;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:operations_persistence_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OperationsPersistenceIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";
    private static final String DEVELOPMENT_PRINCIPAL = "X-Novel-Development-Principal";

    @Autowired NovelStore store;
    @Autowired AuthService authService;
    @Autowired ContentModerationService contentModerationService;
    @Autowired ContentModerationReviewService contentModerationReviewService;
    @Autowired AuditTrail auditTrail;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired MockMvc mvc;
    @Autowired OperationsRepository operationsRepository;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void authorApplicationsSurviveRecreationBlockSecondPendingAndPersistDecisions() throws Exception {
        AuthService.AuthenticatedSession session = authService.register(
                "application.owner@example.test",
                "申请作者",
                "correct-horse-battery-staple");
        long userId = session.user().id();
        AuthorApplication pending = store.applyAuthor(userId, "北辰", "我会持续完成长篇创作。");

        NovelStore reloadedStore = reloadedStore();
        assertThat(reloadedStore.authorApplications()).containsExactly(pending);
        assertThatThrownBy(() -> reloadedStore.applyAuthor(userId, "第二笔名", "重复待处理申请不应写入。"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("an author application is already pending");

        AuthorApplication rejected = reloadedStore.decideAuthorApplication(1L, pending.id(), false, "请补充作品计划");
        assertThat(rejected.status()).isEqualTo("REJECTED");
        assertThat(rejected.reason()).isEqualTo("请补充作品计划");
        assertThat(rejected.decidedAt()).isNotNull();
        assertThat(rejected.decidedByUserId()).isEqualTo(1L);
        assertThat(reloadedStore.authorApplications()).isEmpty();

        AuthorApplication retry = reloadedStore.applyAuthor(userId, "北辰", "已补充完整作品计划。");
        AuthorApplication approved = reloadedStore.decideAuthorApplication(1L, retry.id(), true, "审核通过");
        assertThat(approved.status()).isEqualTo("APPROVED");
        assertThat(approved.reason()).isEqualTo("审核通过");
        assertThat(approved.decidedAt()).isNotNull();
        assertThat(approved.decidedByUserId()).isEqualTo(1L);
        assertThat(authService.resolveBffSession(session.bffSessionId()).orElseThrow().roles())
                .contains(Role.AUTHOR);

        mvc.perform(get("/api/v1/author/books")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId()))
                .andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT pending_user_id FROM novel_author_application WHERE id = ?",
                Long.class,
                retry.id())).isNull();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT decided_by_user_id FROM novel_author_application WHERE id = ?",
                Long.class,
                retry.id())).isEqualTo(1L);
        assertThat(auditTrail.recent()).anyMatch(entry -> entry.contains(
                "author application=" + retry.id() + " reviewer=1 APPROVED"));
    }

    @Test
    void approvedApplicationCannotRaceIntoANewPendingApplication() throws Exception {
        AuthService.AuthenticatedSession session = authService.register(
                "application.race@example.test",
                "并发申请人",
                "correct-horse-battery-staple");
        long userId = session.user().id();
        AuthorApplication pending = store.applyAuthor(userId, "并发笔名", "先提交，再由站长通过。");

        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        CountDownLatch approvalHasApplicationLock = new CountDownLatch(1);
        CountDownLatch releaseApproval = new CountDownLatch(1);
        CountDownLatch applicantStarted = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<?> approval = workers.submit(() -> transaction.executeWithoutResult(ignored -> {
                operationsRepository.lockAuthorApplication(pending.id()).orElseThrow();
                approvalHasApplicationLock.countDown();
                awaitLatch(releaseApproval);
                store.decideAuthorApplication(1L, pending.id(), true, "并发审核通过");
            }));
            assertThat(approvalHasApplicationLock.await(5, TimeUnit.SECONDS)).isTrue();

            Future<?> applicant = workers.submit(() -> {
                applicantStarted.countDown();
                return store.applyAuthor(userId, "第二笔名", "审批提交期间不应生成新的待处理申请。");
            });
            assertThat(applicantStarted.await(5, TimeUnit.SECONDS)).isTrue();

            // The applicant has entered its transaction but cannot advance beyond the application's
            // FOR UPDATE lock. Releasing approval commits the profile before that current read runs.
            assertThatThrownBy(() -> applicant.get(500, TimeUnit.MILLISECONDS))
                    .isInstanceOf(TimeoutException.class);
            releaseApproval.countDown();
            approval.get(5, TimeUnit.SECONDS);

            ExecutionException failure = assertThrows(
                    ExecutionException.class,
                    () -> applicant.get(5, TimeUnit.SECONDS));
            assertThat(failure.getCause())
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("an approved author cannot submit another application");
        } finally {
            releaseApproval.countDown();
            workers.shutdownNow();
            assertThat(workers.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_author_application WHERE user_id = ? AND status = 'PENDING'",
                Integer.class,
                userId)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_author_application WHERE user_id = ? AND status = 'APPROVED'",
                Integer.class,
                userId)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_author_profile WHERE user_id = ?",
                Integer.class,
                userId)).isEqualTo(1);
        assertThat(authService.resolveBffSession(session.bffSessionId()).orElseThrow().roles()).contains(Role.AUTHOR);
    }

    @Test
    void serviceRejectsAnOversizedAuthorDecisionReasonBeforeChangingState() {
        AuthService.AuthenticatedSession session = authService.register(
                "service.long.author.review@example.test",
                "服务层长度检查",
                "correct-horse-battery-staple");
        AuthorApplication application = store.applyAuthor(session.user().id(), "服务笔名", "等待审核的申请材料。");

        assertThatThrownBy(() -> store.decideAuthorApplication(1L, application.id(), true, "x".repeat(1025)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("author application review reason is required is too long");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM novel_author_application WHERE id = ?",
                String.class,
                application.id())).isEqualTo("PENDING");
    }

    @Test
    void persistedSensitiveVocabularyIsUsedForCommentsAndChaptersAfterRepositoryRecreation() {
        store.addSensitiveWord("跨实例屏蔽词");
        OperationsRepository reloadedOperations = new OperationsRepository(jdbcTemplate);
        assertThat(reloadedOperations.sensitiveWords()).contains("敏感词", "跨实例屏蔽词");
        assertThat(reloadedOperations.containsSensitiveWord("正文含有跨实例屏蔽词，需要拦截。")).isTrue();

        Comment pendingComment = store.comment(71L, "持久化读者", 1L, null, "评论含跨实例屏蔽词，等待审核。");
        assertThat(pendingComment.status()).isEqualTo("PENDING_REVIEW");
        Chapter heldChapter = store.addChapter(2L, 1L, "运营词库章节", "章节含跨实例屏蔽词，不能发布。", true);
        assertThat(heldChapter.status()).isEqualTo(ChapterStatus.NEEDS_REVIEW);
        assertThat(heldChapter.published()).isFalse();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_sensitive_word WHERE normalized_word = ?",
                Integer.class,
                "跨实例屏蔽词")).isEqualTo(1);
    }

    @Test
    void accountEnabledColumnControlsDisablementAndAdminMetricsWithoutDemoConstants() throws Exception {
        mvc.perform(post("/api/v1/admin/sensitive-words")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "reader")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"word\":\"无权限词\"}"))
                .andExpect(status().isForbidden());

        AuthService.AuthenticatedSession session = authService.register(
                "disabled.account@example.test",
                "待禁用账户",
                "correct-horse-battery-staple");
        long accountId = session.user().id();
        store.saveProgress(accountId, 1L, 1001L, 20);
        mvc.perform(get("/api/v1/admin/dashboard")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activeReaders").value(1))
                .andExpect(jsonPath("$.data.todayReads").value(1));

        mvc.perform(post("/api/v1/admin/users/{userId}/status", accountId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false,\"reason\":\"运营测试暂停账号\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false));
        assertThat(jdbcTemplate.queryForObject("SELECT enabled FROM novel_account WHERE id = ?", Boolean.class, accountId)).isFalse();
        assertThat(authService.resolveBffSession(session.bffSessionId())).isEmpty();
        assertThatThrownBy(() -> store.checkin(accountId))
                .isInstanceOf(SecurityException.class)
                .hasMessage("account is disabled");

        mvc.perform(post("/api/v1/admin/users/{userId}/status", accountId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true,\"reason\":\"运营测试恢复账号\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(true));
        assertThat(store.checkin(accountId)).isEqualTo(10);
        mvc.perform(get("/api/v1/admin/dashboard")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.activeReaders").value(1))
                .andExpect(jsonPath("$.data.todayReads").value(1));
    }

    private NovelStore reloadedStore() {
        return new NovelStore(
                auditTrail,
                new CatalogRepository(jdbcTemplate),
                new WalletRepository(jdbcTemplate),
                new ReaderRepository(jdbcTemplate),
                new InteractionRepository(jdbcTemplate),
                new OperationsRepository(jdbcTemplate),
                authService,
                contentModerationService,
                contentModerationReviewService);
    }

    private static void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("timed out waiting for concurrent test coordination");
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError("interrupted while coordinating concurrent test", exception);
        }
    }
}
