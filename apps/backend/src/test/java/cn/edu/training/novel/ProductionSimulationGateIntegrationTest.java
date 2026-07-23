package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterCandidateType;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.service.NovelStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.annotation.DirtiesContext;

/** An active development profile alone must never allow the simulation in production mode. */
@ActiveProfiles("development")
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.runtime-mode=PRODUCTION",
        "novel.audit.qwen.enabled=false",
        "novel.audit.moderation.development-simulation-enabled=true",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:production_simulation_gate_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ProductionSimulationGateIntegrationTest {
    @Autowired NovelStore store;

    @Test
    void productionRuntimeBlocksSimulationEvenWithADevelopmentProfile() {
        Chapter held = store.addChapter(2L, 1L, "生产闸门", "开发 profile 不应覆盖生产运行模式。", true);
        ChapterCandidate candidate = PendingCandidateQueueTestSupport.pendingCandidate(
                store, ModerationReviewScope.NEW_CHAPTER, held.id());
        ContentModerationAudit audit = store.moderationAudits("CHAPTER_CANDIDATE", 20).stream()
                .filter(item -> item.contentId() == candidate.id())
                .findFirst()
                .orElseThrow();

        assertThat(held.status()).isEqualTo(ChapterStatus.DRAFT);
        assertThat(held.published()).isFalse();
        assertThat(candidate.type()).isEqualTo(ChapterCandidateType.NEW_CHAPTER);
        assertThat(candidate.status()).isEqualTo(ChapterCandidateStatus.PENDING_REVIEW);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(audit.decision()).isEqualTo(ModerationDecision.MODEL_UNAVAILABLE);
        assertThat(audit.simulated()).isFalse();
        assertThat(audit.reason()).contains("simulation").contains("PRODUCTION");
    }
}
