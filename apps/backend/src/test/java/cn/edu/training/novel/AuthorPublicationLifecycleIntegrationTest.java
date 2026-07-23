package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.DuePublicationResult;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.domain.Volume;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.NovelStore;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:author_publication_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorPublicationLifecycleIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void authorCanOnlyCreateAndListVolumesForOwnedBooks() throws Exception {
        String response = mvc.perform(post("/api/v1/author/books/1/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"第一卷 起航\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bookId").value(1))
                .andExpect(jsonPath("$.data.orderNo").value(1))
                .andReturn()
                .getResponse()
                .getContentAsString();
        long volumeId = ((Number) JsonPath.read(response, "$.data.id")).longValue();

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_volume WHERE id = ? AND book_id = ?",
                Integer.class,
                volumeId,
                1L)).isEqualTo(1);
        mvc.perform(get("/api/v1/author/books/1/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(volumeId))
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.meta.page").value(0))
                .andExpect(jsonPath("$.data.meta.size").value(20));
        mvc.perform(post("/api/v1/author/books/2/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"越权卷册\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void authorWorkspacePagesVolumesAndChaptersWithOwnershipAndRequestBounds() throws Exception {
        Volume first = store.createVolume(2L, 1L, "分页卷一");
        Volume second = store.createVolume(2L, 1L, "分页卷二");
        Volume third = store.createVolume(2L, 1L, "分页卷三");
        store.createDraftChapter(2L, 1L, first.id(), "分页章一", "第一段分页草稿。");
        Chapter secondChapter = store.createDraftChapter(2L, 1L, second.id(), "分页章二", "第二段分页草稿。");
        Chapter thirdChapter = store.createDraftChapter(2L, 1L, third.id(), "分页章三", "第三段分页草稿。");

        mvc.perform(get("/api/v1/author/books/1/volumes")
                        .param("page", "1")
                        .param("size", "2")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(third.id()))
                .andExpect(jsonPath("$.data.items[0].chapterCount").value(1))
                .andExpect(jsonPath("$.data.meta.total").value(3))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(2));

        mvc.perform(get("/api/v1/author/books/1/chapters")
                        .param("page", "1")
                        .param("size", "2")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(secondChapter.id()))
                .andExpect(jsonPath("$.data.items[1].id").value(thirdChapter.id()))
                .andExpect(jsonPath("$.data.meta.total").value(4))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(2));

        mvc.perform(get("/api/v1/author/books/2/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/author/books/1/chapters")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/author/books/1/volumes")
                        .param("page", "-1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/author/books/1/chapters")
                        .param("size", "101")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isBadRequest());
    }

    @Test
    void futureScheduledChapterRemainsUnpublishedAndIsNotPubliclyVisible() throws Exception {
        String volumeResponse = mvc.perform(post("/api/v1/author/books/1/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"定时卷\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long volumeId = ((Number) JsonPath.read(volumeResponse, "$.data.id")).longValue();
        String draftResponse = mvc.perform(post("/api/v1/author/books/1/volumes/{volumeId}/chapters", volumeId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"尚未到点\",\"content\":\"这段正文在计划时间前不可读。\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.published").value(false))
                .andReturn().getResponse().getContentAsString();
        long chapterId = ((Number) JsonPath.read(draftResponse, "$.data.id")).longValue();
        Instant publishAt = Instant.now().plusSeconds(600);

        mvc.perform(post("/api/v1/author/books/1/chapters/{chapterId}/schedule", chapterId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"publishAt\":\"" + publishAt + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.data.published").value(false));
        mvc.perform(post("/api/v1/author/scheduled-publications/run")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.processed").value(0));
        mvc.perform(get("/api/v1/public/books/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chapters.length()").value(1))
                .andExpect(jsonPath("$.data.chapters[0].id").value(1001));

        Chapter stored = catalogRepository.findChapterById(chapterId).orElseThrow();
        assertThat(stored.status()).isEqualTo(ChapterStatus.SCHEDULED);
        assertThat(stored.published()).isFalse();
        assertThat(stored.scheduledPublishAt()).isNotNull();
    }

    @Test
    void duePublishingRechecksSensitiveWordsWithoutWithdrawingThePublishedBook() throws Exception {
        Volume volume = store.createVolume(2, 1, "自动发布卷");
        Instant firstDue = Instant.now().plusSeconds(300);
        Chapter safeDraft = store.createDraftChapter(2, 1, volume.id(), "准时发布", "这段安全正文会在到点后公开。");
        store.scheduleChapter(2, 1, safeDraft.id(), firstDue);

        DuePublicationResult safeResult = store.publishDueChapters(2, firstDue.plusSeconds(1));
        assertThat(safeResult.processed()).isEqualTo(1);
        assertThat(safeResult.published()).extracting(Chapter::id).containsExactly(safeDraft.id());
        assertThat(catalogRepository.findChapterById(safeDraft.id()).orElseThrow())
                .extracting(Chapter::status, Chapter::published)
                .containsExactly(ChapterStatus.PUBLISHED, true);
        mvc.perform(get("/api/v1/public/books/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chapters.length()").value(2));

        Instant riskDue = firstDue.plusSeconds(120);
        Chapter riskDraft = store.createDraftChapter(2, 1, volume.id(), "风险定时章", "这段正文包含敏感词，必须在到点时重新审核。");
        store.scheduleChapter(2, 1, riskDraft.id(), riskDue);
        DuePublicationResult riskResult = store.publishDueChapters(2, riskDue.plusSeconds(1));

        assertThat(riskResult.processed()).isEqualTo(1);
        assertThat(riskResult.published()).isEmpty();
        assertThat(riskResult.needsReview()).extracting(Chapter::id).containsExactly(riskDraft.id());
        ChapterCandidate candidate = PendingCandidateQueueTestSupport.pendingCandidate(
                store, ModerationReviewScope.NEW_CHAPTER, riskDraft.id());
        assertThat(catalogRepository.findChapterById(riskDraft.id()).orElseThrow())
                .extracting(Chapter::status, Chapter::published, Chapter::reviewReason)
                .containsExactly(ChapterStatus.DRAFT, false, "命中本地敏感词，已暂停定时发布，等待增量审核");
        assertThat(candidate.status()).isEqualTo(ChapterCandidateStatus.PENDING_REVIEW);
        assertThat(store.book(1).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(store.publishedChapters(1)).extracting(Chapter::id).doesNotContain(riskDraft.id());
        mvc.perform(get("/api/v1/public/books/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chapters.length()").value(2));
    }
}
