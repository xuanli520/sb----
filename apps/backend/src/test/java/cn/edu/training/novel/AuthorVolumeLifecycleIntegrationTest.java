package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookModerationSnapshot;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.Volume;
import cn.edu.training.novel.service.BookModerationSnapshotService;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.NovelStore;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:author_volume_lifecycle_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorVolumeLifecycleIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;

    @Test
    void authorCanRenameAndReorderOwnedVolumesWhileInvalidAndForeignWritesAreRejected() throws Exception {
        Book book = store.createBook(2L, "Volume ordering", "科幻", "volume lifecycle");
        Volume first = store.createVolume(2L, book.id(), "First");
        Volume second = store.createVolume(2L, book.id(), "Second");
        Volume third = store.createVolume(2L, book.id(), "Third");

        mvc.perform(author(put("/api/v1/author/books/{bookId}/volumes/{volumeId}", book.id(), first.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"  Opening arc  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(first.id()))
                .andExpect(jsonPath("$.data.title").value("Opening arc"));

        mvc.perform(author(put("/api/v1/author/books/{bookId}/volumes/{volumeId}/order", book.id(), third.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderNo\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(third.id()))
                .andExpect(jsonPath("$.data.orderNo").value(1));
        assertThat(catalogRepository.findVolumesByBookId(book.id()))
                .extracting(Volume::id, Volume::orderNo)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(third.id(), 1),
                        org.assertj.core.groups.Tuple.tuple(first.id(), 2),
                        org.assertj.core.groups.Tuple.tuple(second.id(), 3));

        mvc.perform(author(put("/api/v1/author/books/{bookId}/volumes/{volumeId}", book.id(), first.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"   \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(author(put("/api/v1/author/books/{bookId}/volumes/{volumeId}/order", book.id(), first.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderNo\":0}"))
                .andExpect(status().isBadRequest());
        mvc.perform(author(put("/api/v1/author/books/{bookId}/volumes/{volumeId}/order", book.id(), first.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderNo\":4}"))
                .andExpect(status().isBadRequest());

        // The development admin identity carries AUTHOR too, but has no ownership of this book.
        mvc.perform(author(put("/api/v1/author/books/{bookId}/volumes/{volumeId}", book.id(), first.id()), "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"foreign rename\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(author(put("/api/v1/author/books/{bookId}/volumes/{volumeId}/order", book.id(), first.id()), "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderNo\":1}"))
                .andExpect(status().isForbidden());
        mvc.perform(author(delete("/api/v1/author/books/{bookId}/volumes/{volumeId}", book.id(), first.id()), "admin"))
                .andExpect(status().isForbidden());
    }

    @Test
    void deletingVolumeRetainsEveryChapterAndRefreshesPendingReviewSnapshot() throws Exception {
        Book book = store.createBook(2L, "Volume deletion", "科幻", "volume deletion lifecycle");
        Volume removed = store.createVolume(2L, book.id(), "Removed volume");
        Volume retained = store.createVolume(2L, book.id(), "Retained volume");
        Chapter draft = store.createDraftChapter(2L, book.id(), removed.id(), "Draft", "draft content");
        Chapter scheduled = store.createDraftChapter(2L, book.id(), removed.id(), "Scheduled", "scheduled content");
        store.scheduleChapter(2L, book.id(), scheduled.id(), Instant.now().plusSeconds(3600));
        Chapter published = store.addChapter(2L, book.id(), removed.id(), "Published", "published content", true);
        int wordCountBefore = store.book(book.id()).words();
        BookModerationSnapshot snapshotBefore = store.moderationSnapshots(book.id(), 10).stream()
                .filter(BookModerationSnapshot::current)
                .findFirst()
                .orElseThrow();

        mvc.perform(author(delete("/api/v1/author/books/{bookId}/volumes/{volumeId}", book.id(), removed.id()), "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(removed.id()))
                .andExpect(jsonPath("$.data.deleted").value(true))
                .andExpect(jsonPath("$.data.detachedChapterCount").value(3));

        assertThat(catalogRepository.findVolumeById(removed.id())).isEmpty();
        assertThat(catalogRepository.findVolumesByBookId(book.id()))
                .singleElement()
                .extracting(Volume::id, Volume::orderNo)
                .containsExactly(retained.id(), 1);
        assertDetachedAndUnchanged(draft, ChapterStatus.DRAFT, false);
        assertDetachedAndUnchanged(scheduled, ChapterStatus.SCHEDULED, false);
        assertDetachedAndUnchanged(published, ChapterStatus.PUBLISHED, true);
        assertThat(store.book(book.id()).words()).isEqualTo(wordCountBefore);

        BookModerationSnapshot snapshotAfter = store.moderationSnapshots(book.id(), 10).stream()
                .filter(BookModerationSnapshot::current)
                .findFirst()
                .orElseThrow();
        assertThat(snapshotAfter.id()).isNotEqualTo(snapshotBefore.id());
        assertThat(snapshotAfter.contentVersionHash()).isEqualTo(
                BookModerationSnapshotService.currentContentVersionHash(
                        store.book(book.id()), catalogRepository.findChaptersByBookId(book.id())));
    }

    @Test
    void offlineBooksRejectVolumeMutations() throws Exception {
        Volume volume = store.createVolume(2L, 1L, "Offline protection");
        store.takeDownBook(1L, 1L, "operator review");

        mvc.perform(author(put("/api/v1/author/books/1/volumes/{volumeId}", volume.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"blocked rename\"}"))
                .andExpect(status().isConflict());
        mvc.perform(author(put("/api/v1/author/books/1/volumes/{volumeId}/order", volume.id()), "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"orderNo\":1}"))
                .andExpect(status().isConflict());
        mvc.perform(author(delete("/api/v1/author/books/1/volumes/{volumeId}", volume.id()), "author"))
                .andExpect(status().isConflict());
    }

    private void assertDetachedAndUnchanged(Chapter expected, ChapterStatus status, boolean published) {
        Chapter actual = catalogRepository.findChapterById(expected.id()).orElseThrow();
        assertThat(actual)
                .extracting(
                        Chapter::id,
                        Chapter::bookId,
                        Chapter::volumeId,
                        Chapter::title,
                        Chapter::content,
                        Chapter::status,
                        Chapter::published,
                        Chapter::orderNo)
                .containsExactly(
                        expected.id(),
                        expected.bookId(),
                        null,
                        expected.title(),
                        expected.content(),
                        status,
                        published,
                        expected.orderNo());
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
}
