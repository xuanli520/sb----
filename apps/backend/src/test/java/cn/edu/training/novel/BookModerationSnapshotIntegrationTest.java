package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookModerationSnapshot;
import cn.edu.training.novel.domain.BookModerationSnapshotStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.service.BookModerationSnapshotService;
import cn.edu.training.novel.service.ContentModelModerationClient;
import cn.edu.training.novel.service.ContentModerationRequest;
import cn.edu.training.novel.service.ModelModerationResult;
import cn.edu.training.novel.service.NovelStore;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@UseTestBffSessions
@SpringBootTest(classes = {
        NovelPlatformApplication.class,
        BookModerationSnapshotIntegrationTest.StubModerationConfiguration.class
}, properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.runtime-mode=TEST",
        "novel.audit.moderation.development-simulation-enabled=false",
        "novel.audit.full-book.scheduler-enabled=false",
        "novel.audit.full-book.max-chunk-characters=256",
        "novel.audit.full-book.max-claims-per-run=32",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:book_moderation_snapshot_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class BookModerationSnapshotIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired NovelStore store;
    @Autowired BookModerationSnapshotService snapshotService;
    @Autowired StubModerationClient client;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    @BeforeEach
    void resetStub() {
        client.reset();
    }

    @Test
    void snapshotCopiesAndChunksTheWholeWorkThenBlocksHumanReleaseUntilTerminal() throws Exception {
        Book book = store.createBook(2L, "Immutable queue", "科幻", "snapshot metadata");
        String chapterContent = "segment-".repeat(100);
        Chapter chapter = store.addChapter(2L, book.id(), "Long work", chapterContent, true);

        BookModerationSnapshot queued = current(book.id());
        assertThat(queued.status()).isEqualTo(BookModerationSnapshotStatus.QUEUED);
        assertThat(queued.totalChunks()).isGreaterThan(2);
        assertThatThrownBy(() -> store.review(1L, book.id(), true, "premature review"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("full-work moderation snapshot is still pending");

        int processed = snapshotService.processAvailableChunks();
        BookModerationSnapshot completed = current(book.id());
        assertThat(processed).isEqualTo(queued.totalChunks());
        assertThat(completed)
                .extracting(BookModerationSnapshot::status, BookModerationSnapshot::aggregateDecision,
                        BookModerationSnapshot::completedChunks)
                .containsExactly(BookModerationSnapshotStatus.COMPLETED, ModerationDecision.PASS, queued.totalChunks());
        assertThat(client.snapshotCallsWithinTransaction).containsOnly(false);

        List<ContentModerationAudit> chunkAudits = store.moderationAudits("BOOK_SNAPSHOT_CHUNK", 100);
        assertThat(chunkAudits).hasSize(queued.totalChunks());
        assertThat(chunkAudits)
                .allSatisfy(audit -> {
                    assertThat(audit.contentType()).isEqualTo("BOOK_SNAPSHOT_CHUNK");
                    assertThat(audit.decision()).isEqualTo(ModerationDecision.PASS);
                    assertThat(audit.rawResponse()).doesNotContain(chapterContent);
                });

        mvc.perform(get("/api/v1/admin/moderation-snapshots")
                        .param("bookId", Long.toString(book.id()))
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].status").value("COMPLETED"))
                .andExpect(jsonPath("$.data[0].aggregateDecision").value("PASS"))
                .andExpect(jsonPath("$.data[0].chunkContent").doesNotExist())
                .andExpect(jsonPath("$.data[0].bookSynopsis").doesNotExist());

        assertThat(store.review(1L, book.id(), true, "terminal full-work review").status().name())
                .isEqualTo("PUBLISHED");
    }

    @Test
    void databaseChangedContentCannotReuseATerminalSnapshot() {
        Book book = store.createBook(2L, "Version guard", "科幻", "versioned evidence");
        Chapter chapter = store.addChapter(2L, book.id(), "First", "immutable original", true);
        snapshotService.processAvailableChunks();
        BookModerationSnapshot completed = current(book.id());
        assertThat(completed.status()).isEqualTo(BookModerationSnapshotStatus.COMPLETED);
        String copiedChapter = jdbc.queryForObject(
                "SELECT chunk_content FROM novel_book_moderation_snapshot_chunk "
                        + "WHERE snapshot_id = ? AND source_chapter_id = ?",
                String.class,
                completed.id(),
                chapter.id());
        assertThat(copiedChapter).isEqualTo("immutable original");

        jdbc.update("UPDATE novel_chapter SET content = ? WHERE id = ?", "changed after snapshot", chapter.id());

        assertThatThrownBy(() -> store.review(1L, book.id(), true, "must not use stale evidence"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("full-work moderation snapshot is stale for the current book version");
        assertThat(jdbc.queryForObject(
                "SELECT chunk_content FROM novel_book_moderation_snapshot_chunk "
                        + "WHERE snapshot_id = ? AND source_chapter_id = ?",
                String.class,
                completed.id(),
                chapter.id())).isEqualTo("immutable original");
        assertThat(current(book.id()).status()).isEqualTo(BookModerationSnapshotStatus.COMPLETED);
    }

    @Test
    void providerFailureCompletesSnapshotAsManualReviewAndRetainsOnlySafeAuditData() {
        client.snapshotMode = SnapshotMode.ERROR;
        Book book = store.createBook(2L, "Failure aggregation", "科幻", "provider outage path");
        Chapter chapter = store.addChapter(2L, book.id(), "Safe title", "private prose must not leak", true);

        assertThat(snapshotService.processAvailableChunks()).isPositive();
        BookModerationSnapshot snapshot = current(book.id());
        assertThat(snapshot)
                .extracting(BookModerationSnapshot::status, BookModerationSnapshot::aggregateDecision)
                .containsExactly(BookModerationSnapshotStatus.COMPLETED, ModerationDecision.MANUAL_REVIEW);
        assertThat(store.moderationAudits("BOOK_SNAPSHOT_CHUNK", 100))
                .allSatisfy(audit -> {
                    assertThat(audit.decision()).isEqualTo(ModerationDecision.MODEL_ERROR);
                    assertThat(audit.errorSummary()).contains("provider-error=IllegalStateException")
                            .doesNotContain(chapter.content());
                });

        // A terminal manual result is still a human decision point, not an automatic punishment.
        assertThat(store.review(1L, book.id(), false, "human reviewer rejected the work").status().name())
                .isEqualTo("REJECTED");
    }

    @Test
    void rejectingAnyChunkProducesARejectAggregateWithoutAutomaticallyPublishingOrPunishing() {
        client.snapshotMode = SnapshotMode.REJECT;
        Book book = store.createBook(2L, "Reject aggregate", "科幻", "rejection aggregation path");
        store.addChapter(2L, book.id(), "Risky", "model classifies this copied chunk", true);

        assertThat(snapshotService.processAvailableChunks()).isPositive();
        assertThat(current(book.id()))
                .extracting(BookModerationSnapshot::status, BookModerationSnapshot::aggregateDecision)
                .containsExactly(BookModerationSnapshotStatus.COMPLETED, ModerationDecision.REJECT);
        assertThat(store.book(book.id()).status().name()).isEqualTo("PENDING_REVIEW");

        // The administrator remains the final decision maker even when the automated aggregate rejects.
        assertThat(store.review(1L, book.id(), false, "reviewer confirms rejection").status().name())
                .isEqualTo("REJECTED");
    }

    @Test
    void laterAuthorRevisionSupersedesTheUnprocessedSnapshot() {
        Book book = store.createBook(2L, "Replacement", "科幻", "queued snapshot replacement");
        Chapter original = store.addChapter(2L, book.id(), "First version", "first version content", true);
        BookModerationSnapshot first = current(book.id());

        Chapter revised = store.updateChapter(
                2L, book.id(), original.id(), "Second version", "second version content", null);
        BookModerationSnapshot current = current(book.id());

        assertThat(revised.content()).isEqualTo("second version content");
        assertThat(current.id()).isNotEqualTo(first.id());
        assertThat(current.current()).isTrue();
        assertThat(store.moderationSnapshots(book.id(), 10))
                .filteredOn(snapshot -> snapshot.id() == first.id())
                .allSatisfy(snapshot -> {
                    assertThat(snapshot.current()).isFalse();
                    assertThat(snapshot.status()).isEqualTo(BookModerationSnapshotStatus.STALE);
                });

        snapshotService.processAvailableChunks();
        assertThat(current(book.id()).status()).isEqualTo(BookModerationSnapshotStatus.COMPLETED);
        assertThat(store.review(1L, book.id(), true, "review current snapshot only").status().name())
                .isEqualTo("PUBLISHED");
    }

    private BookModerationSnapshot current(long bookId) {
        return store.moderationSnapshots(bookId, 10).stream()
                .filter(BookModerationSnapshot::current)
                .findFirst()
                .orElseThrow(() -> new AssertionError("current snapshot was not found"));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class StubModerationConfiguration {
        @Bean
        @Primary
        StubModerationClient contentModelModerationClient() {
            return new StubModerationClient();
        }
    }

    static class StubModerationClient implements ContentModelModerationClient {
        volatile SnapshotMode snapshotMode = SnapshotMode.PASS;
        final List<Boolean> snapshotCallsWithinTransaction = new CopyOnWriteArrayList<>();

        void reset() {
            snapshotMode = SnapshotMode.PASS;
            snapshotCallsWithinTransaction.clear();
        }

        @Override
        public ModelModerationResult moderate(ContentModerationRequest request) {
            Instant startedAt = Instant.now();
            if ("BOOK_SNAPSHOT_CHUNK".equals(request.contentType())) {
                snapshotCallsWithinTransaction.add(TransactionSynchronizationManager.isActualTransactionActive());
                if (snapshotMode == SnapshotMode.ERROR) {
                    throw new IllegalStateException("provider body=" + request.content());
                }
                if (snapshotMode == SnapshotMode.REJECT) {
                    return result(ModerationDecision.REJECT, startedAt);
                }
            }
            return result(ModerationDecision.PASS, startedAt);
        }

        private static ModelModerationResult result(ModerationDecision decision, Instant startedAt) {
            return new ModelModerationResult(
                    decision,
                    "TEST_QWEN",
                    "stub-model",
                    "deterministic stub decision",
                    "{\"decision\":\"" + decision.name() + "\"}",
                    null,
                    false,
                    "stub-request",
                    startedAt,
                    Instant.now());
        }
    }

    enum SnapshotMode {
        PASS,
        ERROR,
        REJECT
    }
}
