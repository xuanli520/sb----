package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ContentModerationReview;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.domain.ModerationReviewDecision;
import cn.edu.training.novel.service.NovelStore;
import cn.edu.training.novel.service.BookModerationSnapshotService;
import cn.edu.training.novel.service.CatalogRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.runtime-mode=TEST",
        "novel.audit.moderation.development-simulation-enabled=true",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:content_moderation_review_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ContentModerationReviewIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired NovelStore store;
    @Autowired MockMvc mvc;
    @Autowired BookModerationSnapshotService bookModerationSnapshotService;
    @Autowired CatalogRepository catalogRepository;

    @Test
    void wholeBookReviewAppendsOnlyCurrentEvidenceForTheSubmittedSnapshot() throws Exception {
        Book book = store.createBook(2L, "Evidence linkage", "科幻", "moderation evidence test");
        Chapter original = store.addChapter(
                2L, book.id(), "Revision candidate", "original safe chapter text", true);
        Chapter stable = store.addChapter(
                2L, book.id(), "Stable chapter", "stable safe chapter text", true);

        assertThat(original.status()).isEqualTo(ChapterStatus.PUBLISHED);
        assertThat(stable.status()).isEqualTo(ChapterStatus.PUBLISHED);
        assertThat(store.book(book.id()).status()).isEqualTo(BookStatus.PENDING_REVIEW);

        List<ContentModerationAudit> auditsBeforeReview = store.moderationAudits("CHAPTER", 50);
        ContentModerationAudit originalAudit = auditFor(
                auditsBeforeReview,
                original.id(),
                chapterHash(original.title(), original.content()));
        ContentModerationAudit stableAudit = auditFor(
                auditsBeforeReview,
                stable.id(),
                chapterHash(stable.title(), stable.content()));
        Set<Long> expectedCurrentAuditIds = Set.of(originalAudit.id(), stableAudit.id());

        assertThat(originalAudit.decision()).isEqualTo(ModerationDecision.SIMULATED_PASS);
        assertThat(stableAudit.decision()).isEqualTo(ModerationDecision.SIMULATED_PASS);

        assertThat(bookModerationSnapshotService.processAvailableChunks()).isPositive();
        Set<Long> expectedReviewAuditIds = new java.util.LinkedHashSet<>(expectedCurrentAuditIds);
        store.moderationAudits("BOOK_SNAPSHOT_CHUNK", 50).stream()
                .map(ContentModerationAudit::id)
                .forEach(expectedReviewAuditIds::add);

        String reason = "current evidence approved by administrator";
        mvc.perform(post("/api/v1/admin/reviews/{bookId}", book.id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"" + reason + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"));

        List<ContentModerationReview> reviews = store.moderationReviews(book.id(), 50);
        assertThat(reviews).hasSize(expectedReviewAuditIds.size());
        assertThat(reviews)
                .extracting(ContentModerationReview::moderationAuditId)
                .containsExactlyInAnyOrderElementsOf(expectedReviewAuditIds);
        assertThat(reviews)
                .allSatisfy(review -> {
                    assertThat(review.bookId()).isEqualTo(book.id());
                    assertThat(review.reviewerUserId()).isEqualTo(1L);
                    assertThat(review.decision()).isEqualTo(ModerationReviewDecision.APPROVED);
                    assertThat(review.reason()).isEqualTo(reason);
                    assertThat(review.reviewedAt()).isNotNull();
                });

        mvc.perform(get("/api/v1/admin/moderation-reviews")
                        .param("bookId", Long.toString(book.id()))
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(expectedReviewAuditIds.size()))
                .andExpect(jsonPath("$.data.meta.total").value(expectedReviewAuditIds.size()))
                .andExpect(jsonPath("$.data.items[0].reviewerUserId").value(1))
                .andExpect(jsonPath("$.data.items[0].decision").value("APPROVED"))
                .andExpect(jsonPath("$.data.items[0].reason").value(reason));

        assertThat(store.moderationAudits("CHAPTER", 50))
                .containsExactlyInAnyOrderElementsOf(auditsBeforeReview);
    }

    @Test
    void deletingRejectedBookRetainsArchivedReviewAndModerationEvidence() {
        Book book = store.createBook(2L, "Archived review", "科幻", "rejected review archive test");
        Chapter held = store.addChapter(2L, book.id(), "Blocked chapter", "contains 敏感词", true);
        ContentModerationAudit audit = auditFor(
                store.moderationAudits("CHAPTER", 50),
                held.id(),
                chapterHash(held.title(), held.content()));

        assertThat(bookModerationSnapshotService.processAvailableChunks()).isPositive();

        Book rejected = store.review(1L, book.id(), false, "rewrite required");
        Chapter returnedDraft = catalogRepository.findChaptersByBookId(book.id()).getFirst();
        List<ContentModerationReview> archivedReviews = store.moderationReviews(book.id(), 50);

        assertThat(rejected.status()).isEqualTo(BookStatus.REJECTED);
        assertThat(returnedDraft.status()).isEqualTo(ChapterStatus.DRAFT);
        assertThat(archivedReviews)
                .extracting(ContentModerationReview::moderationAuditId)
                .contains(audit.id());
        assertThat(archivedReviews)
                .allSatisfy(review -> assertThat(review.decision()).isEqualTo(ModerationReviewDecision.REJECTED));

        store.deleteBook(2L, book.id());

        assertThat(store.moderationReviews(book.id(), 50)).containsExactlyElementsOf(archivedReviews);
        assertThat(store.moderationAudits("CHAPTER", 50)).contains(audit);
    }

    private static ContentModerationAudit auditFor(List<ContentModerationAudit> audits, long chapterId, String contentHash) {
        return audits.stream()
                .filter(audit -> audit.contentId() == chapterId && audit.contentVersionHash().equals(contentHash))
                .findFirst()
                .orElseThrow(() -> new AssertionError("expected current moderation audit was not found"));
    }

    private static String chapterHash(String title, String content) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(("CHAPTER\n" + title + "\n" + content).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new AssertionError("SHA-256 must be available for moderation version assertions", exception);
        }
    }
}
