package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterCandidateType;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.NovelStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.runtime-mode=TEST",
        "novel.audit.moderation.development-simulation-enabled=true",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:incremental_chapter_candidate_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class IncrementalChapterCandidateIntegrationTest {
    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;

    @Test
    void publishedRevisionKeepsOldTextPublicUntilCandidateApproval() {
        Chapter original = catalogRepository.findChapterById(1001L).orElseThrow();
        String revisedContent = "replacement approved only after incremental review";

        Chapter proposal = store.updateChapter(2L, 1L, original.id(), "第一章 修订", revisedContent, null);
        ChapterCandidate candidate = onlyCandidate();

        assertThat(proposal)
                .extracting(Chapter::title, Chapter::content, Chapter::status, Chapter::published)
                .containsExactly(original.title(), original.content(), ChapterStatus.PUBLISHED, true);
        assertThat(candidate)
                .extracting(ChapterCandidate::type, ChapterCandidate::status, ChapterCandidate::targetChapterId)
                .containsExactly(ChapterCandidateType.CHAPTER_REVISION, ChapterCandidateStatus.PENDING_REVIEW, original.id());
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(catalogRepository.findChapterById(original.id()).orElseThrow())
                .extracting(Chapter::title, Chapter::content, Chapter::status, Chapter::published)
                .containsExactly(original.title(), original.content(), ChapterStatus.PUBLISHED, true);
        assertThat(store.reviewQueue(ModerationReviewScope.CHAPTER_REVISION, 0, 12).items())
                .anySatisfy(item -> {
                    assertThat(item.scope()).isEqualTo(ModerationReviewScope.CHAPTER_REVISION);
                    assertThat(item.candidate().id()).isEqualTo(candidate.id());
                });

        ChapterCandidate approved = store.reviewChapterCandidate(1L, candidate.id(), true, "incremental copy approved");

        assertThat(approved.status()).isEqualTo(ChapterCandidateStatus.APPROVED);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(catalogRepository.findChapterById(original.id()).orElseThrow())
                .extracting(Chapter::title, Chapter::content, Chapter::status, Chapter::published)
                .containsExactly("第一章 修订", revisedContent, ChapterStatus.PUBLISHED, true);
        assertThat(store.moderationReviews(1L, 20))
                .extracting(review -> review.moderationAuditId())
                .contains(approved.moderationAuditId());
    }

    @Test
    void rejectedIncrementalNewChapterReturnsOnlyThatSourceToDraft() {
        store.addSensitiveWord(1L, "候选阻断词");
        Chapter proposal = store.addChapter(2L, 1L, "候选新章", "这一章包含候选阻断词", true);
        ChapterCandidate candidate = onlyCandidate();

        assertThat(proposal.status()).isEqualTo(ChapterStatus.DRAFT);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(candidate.type()).isEqualTo(ChapterCandidateType.NEW_CHAPTER);

        ChapterCandidate rejected = store.reviewChapterCandidate(1L, candidate.id(), false, "rewrite the blocked text");

        assertThat(rejected.status()).isEqualTo(ChapterCandidateStatus.REJECTED);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(catalogRepository.findChapterById(proposal.id()).orElseThrow())
                .extracting(Chapter::status, Chapter::published)
                .containsExactly(ChapterStatus.DRAFT, false);
        assertThat(store.publishedChapters(1L)).extracting(Chapter::id).doesNotContain(proposal.id());
    }

    private ChapterCandidate onlyCandidate() {
        return store.authorChapterCandidates(2L, 1L).stream().findFirst().orElseThrow();
    }
}
