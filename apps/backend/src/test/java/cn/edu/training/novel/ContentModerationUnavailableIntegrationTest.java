package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterCandidateType;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.DuePublicationResult;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.domain.Volume;
import cn.edu.training.novel.service.NovelStore;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

/** Production-like no-provider configuration must not release direct or scheduled chapters. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.audit.moderation.development-simulation-enabled=false",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:content_moderation_unavailable_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ContentModerationUnavailableIntegrationTest {
    @Autowired NovelStore store;

    @Test
    void disabledQwenHoldsOnlyTheIncrementalDirectSubmission() {
        Chapter held = store.addChapter(2L, 1L, "未配置模型", "即使正文安全也不能在生产配置下自动发布。", true);

        ChapterCandidate candidate = candidateFor(held.id());
        ContentModerationAudit audit = auditFor(candidate.id());
        assertThat(held.status()).isEqualTo(ChapterStatus.NEEDS_REVIEW);
        assertThat(held.published()).isFalse();
        assertThat(candidate.type()).isEqualTo(ChapterCandidateType.NEW_CHAPTER);
        assertThat(candidate.status()).isEqualTo(ChapterCandidateStatus.PENDING_REVIEW);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(audit.decision()).isEqualTo(ModerationDecision.MODEL_UNAVAILABLE);
        assertThat(audit.simulated()).isFalse();
    }

    @Test
    void disabledQwenAlsoFailsClosedWhenAScheduledChapterBecomesDue() {
        Volume volume = store.createVolume(2L, 1L, "定时审核卷");
        Chapter draft = store.createDraftChapter(2L, 1L, volume.id(), "到点审核", "定时发布也必须经过模型审核。");
        Instant scheduledAt = Instant.now().plusSeconds(30);
        store.scheduleChapter(2L, 1L, draft.id(), scheduledAt);

        DuePublicationResult result = store.publishDueChapters(2L, scheduledAt.plusSeconds(1));
        ChapterCandidate candidate = candidateFor(draft.id());
        ContentModerationAudit audit = auditFor(candidate.id());

        assertThat(result.published()).isEmpty();
        assertThat(result.needsReview()).extracting(Chapter::id).containsExactly(draft.id());
        assertThat(candidate.type()).isEqualTo(ChapterCandidateType.NEW_CHAPTER);
        assertThat(candidate.status()).isEqualTo(ChapterCandidateStatus.PENDING_REVIEW);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(audit.decision()).isEqualTo(ModerationDecision.MODEL_UNAVAILABLE);
    }

    private ChapterCandidate candidateFor(long chapterId) {
        return store.authorChapterCandidates(2L, 1L).stream()
                .filter(item -> item.targetChapterId() == chapterId)
                .findFirst()
                .orElseThrow();
    }

    private ContentModerationAudit auditFor(long candidateId) {
        return store.moderationAudits("CHAPTER_CANDIDATE", 50).stream()
                .filter(item -> item.contentId() == candidateId)
                .findFirst()
                .orElseThrow();
    }
}
