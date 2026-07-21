package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.DuePublicationResult;
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

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:author_publication_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorPublicationLifecycleIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";
    private static final String DEVELOPMENT_PRINCIPAL = "X-Novel-Development-Principal";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void authorCanOnlyCreateAndListVolumesForOwnedBooks() throws Exception {
        String response = mvc.perform(post("/api/v1/author/books/1/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author")
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
                        .header(DEVELOPMENT_PRINCIPAL, "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].id").value(volumeId));
        mvc.perform(post("/api/v1/author/books/2/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"越权卷册\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void futureScheduledChapterRemainsUnpublishedAndIsNotPubliclyVisible() throws Exception {
        String volumeResponse = mvc.perform(post("/api/v1/author/books/1/volumes")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"定时卷\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long volumeId = ((Number) JsonPath.read(volumeResponse, "$.data.id")).longValue();
        String draftResponse = mvc.perform(post("/api/v1/author/books/1/volumes/{volumeId}/chapters", volumeId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author")
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
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"publishAt\":\"" + publishAt + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.data.published").value(false));
        mvc.perform(post("/api/v1/author/scheduled-publications/run")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author"))
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
    void duePublishingRechecksSensitiveWordsAndRoutesRiskToWholeBookReview() throws Exception {
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
        assertThat(catalogRepository.findChapterById(riskDraft.id()).orElseThrow())
                .extracting(Chapter::status, Chapter::published, Chapter::reviewReason)
                .containsExactly(ChapterStatus.NEEDS_REVIEW, false, "命中本地敏感词，已暂停定时发布");
        assertThat(store.book(1).status()).isEqualTo(BookStatus.NEEDS_REVIEW);
        assertThat(store.publishedChapters(1)).extracting(Chapter::id).doesNotContain(riskDraft.id());
        mvc.perform(get("/api/v1/public/books/1")).andExpect(status().isNotFound());
    }
}
