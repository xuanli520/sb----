package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.BookModerationSnapshotService;
import cn.edu.training.novel.service.NovelStore;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:content_moderation_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ContentModerationWorkflowIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired ApplicationContext context;
    @Autowired BookModerationSnapshotService bookModerationSnapshotService;

    @Test
    void localSensitiveWordWinsBeforeModelAndCreatesAnAuditableHeldChapter() throws Exception {
        Chapter held = store.addChapter(2L, 1L, "本地命中", "正文包含敏感词，模型不应被调用。", true);

        ChapterCandidate candidate = onlyCandidateFor(held.id());
        assertThat(held.status()).isEqualTo(ChapterStatus.DRAFT);
        assertThat(held.published()).isFalse();
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(candidate.status()).isEqualTo(ChapterCandidateStatus.PENDING_REVIEW);
        ContentModerationAudit audit = onlyAuditFor("CHAPTER_CANDIDATE", candidate.id());
        assertThat(audit)
                .extracting(ContentModerationAudit::contentType, ContentModerationAudit::contentId,
                        ContentModerationAudit::decision, ContentModerationAudit::provider,
                        ContentModerationAudit::simulated)
                .containsExactly("CHAPTER_CANDIDATE", candidate.id(), ModerationDecision.LOCAL_SENSITIVE_WORD,
                        "LOCAL_SENSITIVE_WORD", false);
        assertThat(audit.contentVersionHash()).hasSize(64).doesNotContain("敏感词");
        assertThat(audit.rawResponse()).isNull();

        mvc.perform(get("/api/v1/admin/moderation-audits")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].contentId").value(candidate.id()))
                .andExpect(jsonPath("$.data.items[0].decision").value("LOCAL_SENSITIVE_WORD"));
    }

    @Test
    void explicitDevelopmentSimulationPersistsItsMarkerButCannotPublishAWork() {
        Book draftBook = store.createBook(2L, "模拟审核作品", "科幻", "需要人工审核的完整作品");

        Chapter chapter = store.addChapter(2L, draftBook.id(), "模拟通过章节", "安全的开发测试正文", true);
        ContentModerationAudit audit = onlyAuditFor("CHAPTER", chapter.id());

        assertThat(chapter.status()).isEqualTo(ChapterStatus.PUBLISHED);
        assertThat(audit.decision()).isEqualTo(ModerationDecision.SIMULATED_PASS);
        assertThat(audit.simulated()).isTrue();
        assertThat(audit.provider()).isEqualTo("DEVELOPMENT_SIMULATION");
        assertThat(store.book(draftBook.id()).status()).isEqualTo(BookStatus.PENDING_REVIEW);
        assertThatThrownBy(() -> store.publishedBook(draftBook.id()))
                .hasMessage("book not published");

        assertThat(bookModerationSnapshotService.processAvailableChunks()).isPositive();
        Book reviewed = store.review(1L, draftBook.id(), true, "站长完整作品人工审核通过");
        assertThat(reviewed.status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(catalogRepository.findPublishedChaptersByBookId(draftBook.id()))
                .extracting(Chapter::id)
                .containsExactly(chapter.id());
    }

    @Test
    void defaultTestContextHasNoNetworkCapableChatModel() {
        // The test profile uses the explicit simulation. The application still exposes no ChatModel
        // because Qwen itself is not enabled, preventing accidental live requests.
        assertThat(context.getBeansOfType(ChatModel.class)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_content_moderation_audit", Long.class)).isZero();
    }

    private ChapterCandidate onlyCandidateFor(long chapterId) {
        return PendingCandidateQueueTestSupport.pendingCandidate(
                store, ModerationReviewScope.NEW_CHAPTER, chapterId);
    }

    private ContentModerationAudit onlyAuditFor(String contentType, long contentId) {
        List<ContentModerationAudit> audits = store.moderationAudits(contentType, 50).stream()
                .filter(item -> item.contentId() == contentId)
                .toList();
        assertThat(audits).hasSize(1);
        return audits.getFirst();
    }
}
