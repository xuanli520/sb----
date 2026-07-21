package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.DuePublicationResult;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Controlled in-process publisher for due chapter schedules. The service owns the transactional
 * state transition and re-runs the sensitive-word check; this job only supplies the trusted clock.
 */
@Component
@ConditionalOnProperty(
        prefix = "novel.scheduled-publication",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class ScheduledChapterPublicationJob {
    private static final Logger log = LoggerFactory.getLogger(ScheduledChapterPublicationJob.class);

    private final NovelStore novelStore;

    public ScheduledChapterPublicationJob(NovelStore novelStore) {
        this.novelStore = novelStore;
    }

    @Scheduled(
            fixedDelayString = "${novel.scheduled-publication.fixed-delay:PT30S}",
            initialDelayString = "${novel.scheduled-publication.initial-delay:PT5S}")
    public void publishDueChapters() {
        try {
            DuePublicationResult result = novelStore.publishAllDueChapters(Instant.now());
            if (result.processed() > 0) {
                log.info(
                        "Published due chapters: processed={}, published={}, needsReview={}",
                        result.processed(),
                        result.published().size(),
                        result.needsReview().size());
            }
        } catch (RuntimeException exception) {
            // A failed run is retried on the next interval; exceptions must not terminate scheduling.
            log.error("Unable to publish due chapters", exception);
        }
    }
}
