package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.fail;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.domain.Volume;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.NovelStore;
import java.time.Duration;
import java.time.Instant;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=true",
        "novel.scheduled-publication.initial-delay=0",
        "novel.scheduled-publication.fixed-delay=25",
        "spring.datasource.url=jdbc:h2:mem:scheduled_publication_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ScheduledChapterPublicationIntegrationTest {
    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void schedulerPublishesSafeDueChapterWithoutAuthorPublishRequest() throws Exception {
        Volume volume = store.createVolume(2, 1, "后台安全发布卷");
        Chapter draft = store.createDraftChapter(2, 1, volume.id(), "自动公开", "这段正文由后台任务公开。 ");
        store.scheduleChapter(2, 1, draft.id(), Instant.now().plusMillis(200));

        await("safe chapter publication", () -> catalogRepository.findChapterById(draft.id())
                .map(chapter -> chapter.status() == ChapterStatus.PUBLISHED && chapter.published())
                .orElse(false));

        Chapter published = catalogRepository.findChapterById(draft.id()).orElseThrow();
        assertThat(published.scheduledPublishAt()).isNull();
        assertThat(published.publishedAt()).isNotNull();
        assertThat(store.book(1).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(store.publishedChapters(1)).extracting(Chapter::id).contains(draft.id());
        assertThat(auditCount("%publish incremental chapter=" + draft.id() + " candidate=%")).isEqualTo(1);
    }

    @Test
    void schedulerRechecksSensitiveWordsAndBlocksRiskyDueChapterWithoutAuthorPublishRequest() throws Exception {
        Volume volume = store.createVolume(2, 1, "后台风险发布卷");
        Chapter draft = store.createDraftChapter(2, 1, volume.id(), "自动拦截", "该章节含有敏感词，必须由后台复检拦截。 ");
        store.scheduleChapter(2, 1, draft.id(), Instant.now().plusMillis(200));

        await("risky chapter review transition", () -> catalogRepository.findChapterById(draft.id())
                .map(chapter -> chapter.status() == ChapterStatus.DRAFT && !chapter.published())
                .orElse(false));

        Chapter held = catalogRepository.findChapterById(draft.id()).orElseThrow();
        ChapterCandidate candidate = PendingCandidateQueueTestSupport.pendingCandidate(
                store, ModerationReviewScope.NEW_CHAPTER, draft.id());
        assertThat(held.scheduledPublishAt()).isNull();
        assertThat(held.reviewReason()).isEqualTo("命中本地敏感词，已暂停定时发布，等待增量审核");
        assertThat(candidate.status()).isEqualTo(ChapterCandidateStatus.PENDING_REVIEW);
        assertThat(store.book(1).status()).isEqualTo(BookStatus.PUBLISHED);
        assertThat(store.publishedChapters(1)).extracting(Chapter::id).doesNotContain(draft.id());
        assertThat(auditCount("%hold incremental chapter=" + draft.id() + " candidate=%")).isEqualTo(1);
    }

    private int auditCount(String pattern) {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE ?",
                Integer.class,
                pattern);
    }

    private static void await(String description, BooleanSupplier condition) throws InterruptedException {
        Instant deadline = Instant.now().plus(TIMEOUT);
        while (Instant.now().isBefore(deadline)) {
            if (condition.getAsBoolean()) return;
            Thread.sleep(20);
        }
        fail("Timed out waiting for " + description);
    }
}
