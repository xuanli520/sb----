package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.nullValue;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.domain.Volume;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.NovelStore;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:author_content_editing_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorContentEditingIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;
    @Autowired JdbcTemplate jdbc;

    @Test
    void authorCanEditDraftAndScheduledChapterWithoutLosingScheduleOrWordCount() throws Exception {
        Book book = store.createBook(2L, "Edit lifecycle", "科幻", "draft metadata");
        Volume volume = store.createVolume(2L, book.id(), "Volume one");
        Chapter draft = store.createDraftChapter(2L, book.id(), volume.id(), "Before", "old copy");

        mvc.perform(author(put("/api/v1/author/books/{bookId}/chapters/{chapterId}", book.id(), draft.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"After draft\",\"content\":\"new longer draft copy\",\"volumeId\":" + volume.id() + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.title").value("After draft"));

        assertThat(store.book(book.id()).words()).isEqualTo("new longer draft copy".length());
        Instant scheduledAt = Instant.now().plusSeconds(3600);
        store.scheduleChapter(2L, book.id(), draft.id(), scheduledAt);

        mvc.perform(author(put("/api/v1/author/books/{bookId}/chapters/{chapterId}", book.id(), draft.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"After schedule\",\"content\":\"scheduled replacement\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.data.published").value(false));

        Chapter persisted = catalogRepository.findChapterById(draft.id()).orElseThrow();
        assertThat(persisted)
                .extracting(Chapter::title, Chapter::content, Chapter::status, Chapter::scheduledPublishAt, Chapter::volumeId)
                .containsExactly("After schedule", "scheduled replacement", ChapterStatus.SCHEDULED, persisted.scheduledPublishAt(), volume.id());
        assertThat(persisted.scheduledPublishAt()).isNotNull();
        assertThat(store.book(book.id()).words()).isEqualTo("scheduled replacement".length());
        assertThat(auditCount("%update chapter=" + draft.id() + " author=2 state=SCHEDULED%")).isEqualTo(1);
    }

    @Test
    void publishedChapterEditUsesAnIndependentCandidateAndKeepsTheBookPublic() throws Exception {
        Chapter original = catalogRepository.findChapterById(1001L).orElseThrow();
        String safeRevision = "safe revised public chapter";

        mvc.perform(author(put("/api/v1/author/books/1/chapters/1001"), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Revised port\",\"content\":\"" + safeRevision + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.published").value(true))
                .andExpect(jsonPath("$.data.content").value(original.content()));

        ChapterCandidate firstCandidate = PendingCandidateQueueTestSupport.pendingCandidate(
                store, ModerationReviewScope.CHAPTER_REVISION, original.id());
        assertThat(firstCandidate)
                .extracting(ChapterCandidate::targetChapterId, ChapterCandidate::status, ChapterCandidate::content)
                .containsExactly(original.id(), ChapterCandidateStatus.PENDING_REVIEW, safeRevision);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        mvc.perform(get("/api/v1/public/books/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chapters[0].content").value(original.content()));

        mvc.perform(author(post("/api/v1/admin/reviews/candidates/{candidateId}", firstCandidate.id()), "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"incremental revision approved\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"));
        assertThat(catalogRepository.findChapterById(1001L).orElseThrow())
                .extracting(Chapter::content, Chapter::status, Chapter::published)
                .containsExactly(safeRevision, ChapterStatus.PUBLISHED, true);

        mvc.perform(author(put("/api/v1/author/books/1/chapters/1001"), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Sensitive revision\",\"content\":\"contains 敏感词\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"))
                .andExpect(jsonPath("$.data.content").value(safeRevision));
        ChapterCandidate blockedCandidate = PendingCandidateQueueTestSupport.pendingCandidate(
                store, ModerationReviewScope.CHAPTER_REVISION, original.id());
        assertThat(blockedCandidate.status()).isEqualTo(ChapterCandidateStatus.PENDING_REVIEW);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);

        mvc.perform(author(post("/api/v1/admin/reviews/candidates/{candidateId}", blockedCandidate.id()), "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":false,\"reason\":\"needs a rewrite\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REJECTED"));
        assertThat(catalogRepository.findChapterById(1001L).orElseThrow())
                .extracting(Chapter::content, Chapter::status, Chapter::published)
                .containsExactly(safeRevision, ChapterStatus.PUBLISHED, true);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);

        mvc.perform(author(get("/api/v1/author/books/1/chapters"), "author")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(1001))
                .andExpect(jsonPath("$.data.items[0].latestCandidate.status").value("REJECTED"))
                .andExpect(jsonPath("$.data.items[0].latestCandidate.reviewReason").value("needs a rewrite"));

        mvc.perform(author(put("/api/v1/author/books/1/chapters/1001"), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Approved revision\",\"content\":\"approved replacement copy\"}"))
                .andExpect(status().isOk());
        ChapterCandidate approvedCandidate = PendingCandidateQueueTestSupport.pendingCandidate(
                store, ModerationReviewScope.CHAPTER_REVISION, 1001L);
        mvc.perform(author(post("/api/v1/admin/reviews/candidates/{candidateId}", approvedCandidate.id()), "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"approved replacement\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"));

        mvc.perform(author(get("/api/v1/author/books/1/chapters"), "author")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].latestCandidate").value(nullValue()));
    }

    @Test
    void bookAndChapterEditsRejectInvalidStateAndForeignOwnership() throws Exception {
        Book draft = store.createBook(2L, "Metadata draft", "科幻", "before synopsis");

        mvc.perform(author(put("/api/v1/author/books/{bookId}", draft.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Metadata after\",\"category\":\"悬疑\",\"synopsis\":\"after synopsis\",\"serialStatus\":\"已完结\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Metadata after"))
                .andExpect(jsonPath("$.data.serialStatus").value("已完结"));
        assertThat(store.book(draft.id()))
                .extracting(Book::category, Book::synopsis, Book::cover, Book::status)
                .containsExactly("悬疑", "after synopsis", null, BookStatus.DRAFT);
        assertThat(auditCount("%update book=" + draft.id() + " author=2 state=DRAFT%")).isEqualTo(1);

        mvc.perform(author(put("/api/v1/author/books/{bookId}", draft.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Metadata after\",\"category\":\"悬疑\",\"synopsis\":\"after synopsis\",\"cover\":\"https://untrusted.example/cover.png\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(author(put("/api/v1/author/books/{bookId}", draft.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"  \",\"category\":\"科幻\",\"synopsis\":\"valid\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(author(put("/api/v1/author/books/1"), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"not allowed\",\"category\":\"科幻\",\"synopsis\":\"published metadata\"}"))
                .andExpect(status().isConflict());
        mvc.perform(author(put("/api/v1/author/books/2/chapters/1002"), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"foreign\",\"content\":\"foreign chapter\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(author(delete("/api/v1/author/books/1"), "author"))
                .andExpect(status().isConflict());
    }

    @Test
    void safeDeletesMaintainCatalogAndWordCountAndRespectExternalReferences() throws Exception {
        Book book = store.createBook(2L, "Delete lifecycle", "科幻", "safe deletion test");
        Volume volume = store.createVolume(2L, book.id(), "Delete volume");
        Chapter draft = store.createDraftChapter(2L, book.id(), volume.id(), "Delete draft", "remove me");
        Chapter scheduled = store.createDraftChapter(2L, book.id(), volume.id(), "Keep draft", "keep until book delete");
        store.scheduleChapter(2L, book.id(), scheduled.id(), Instant.now().plusSeconds(3600));

        mvc.perform(author(delete("/api/v1/author/books/{bookId}/chapters/{chapterId}", book.id(), draft.id()), "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(draft.id()))
                .andExpect(jsonPath("$.data.deleted").value(true));
        assertThat(catalogRepository.findChapterById(draft.id())).isEmpty();
        assertThat(store.book(book.id()).words()).isEqualTo("keep until book delete".length());

        // A legacy import may have established this reference before V13 tightened shelf writes
        // to published works. Keep the defensive delete guard covered without weakening V13.
        jdbc.update(
                "INSERT INTO novel_reader_bookshelf(user_id, book_id, added_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                77L,
                book.id());
        mvc.perform(author(delete("/api/v1/author/books/{bookId}", book.id()), "author"))
                .andExpect(status().isConflict());
        jdbc.update("DELETE FROM novel_reader_bookshelf WHERE user_id = ? AND book_id = ?", 77L, book.id());

        mvc.perform(author(delete("/api/v1/author/books/{bookId}", book.id()), "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(book.id()))
                .andExpect(jsonPath("$.data.deleted").value(true));
        assertThat(catalogRepository.findById(book.id())).isEmpty();
        assertThat(catalogRepository.findVolumesByBookId(book.id())).isEmpty();
        assertThat(catalogRepository.findChaptersByBookId(book.id())).isEmpty();
        assertThat(auditCount("%delete chapter=" + draft.id() + " author=2 book=" + book.id() + "%")).isEqualTo(1);
        assertThat(auditCount("%delete book=" + book.id() + " author=2 words=" + "keep until book delete".length() + "%")).isEqualTo(1);
    }

    @Test
    void concurrentEditAndDeleteAreSerializedWithoutLeavingStaleWordCount() throws Exception {
        Book book = store.createBook(2L, "Concurrent lifecycle", "科幻", "concurrency test");
        Chapter draft = store.addChapter(2L, book.id(), "Concurrent draft", "original words", false);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> edit = executor.submit(afterStart(ready, start,
                    () -> store.updateChapter(2L, book.id(), draft.id(), "Concurrent edit", "replacement words", null)));
            Future<Throwable> delete = executor.submit(afterStart(ready, start,
                    () -> store.deleteChapter(2L, book.id(), draft.id())));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            List<Throwable> outcomes = new ArrayList<>();
            outcomes.add(edit.get(10, TimeUnit.SECONDS));
            outcomes.add(delete.get(10, TimeUnit.SECONDS));

            assertThat(outcomes).anyMatch(Objects::isNull);
            assertThat(catalogRepository.findChapterById(draft.id())).isEmpty();
            assertThat(store.book(book.id()).words()).isZero();
            assertThat(auditCount("%delete chapter=" + draft.id() + " author=2 book=" + book.id() + "%")).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
    }

    private MockHttpServletRequestBuilder author(MockHttpServletRequestBuilder request, String principal) {
        return request.header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header(TestBffSessions.HEADER, testSession(principal));
    }

    private static String testSession(String principal) {
        return switch (principal) {
            case "admin" -> TestBffSessions.ADMIN;
            case "author" -> TestBffSessions.AUTHOR;
            case "reader" -> TestBffSessions.READER;
            default -> throw new IllegalArgumentException("unknown test principal: " + principal);
        };
    }

    private int auditCount(String pattern) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE ?", Integer.class, pattern);
        return count == null ? 0 : count;
    }

    private static Callable<Throwable> afterStart(CountDownLatch ready, CountDownLatch start, ThrowingRunnable operation) {
        return () -> {
            ready.countDown();
            start.await(5, TimeUnit.SECONDS);
            try {
                operation.run();
                return null;
            } catch (Throwable failure) {
                return failure;
            }
        };
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }
}
