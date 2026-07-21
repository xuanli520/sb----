package cn.edu.training.novel.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Background caller for leased full-work chunks. It has no browser-facing trigger. */
@Component
@ConditionalOnProperty(
        prefix = "novel.audit.full-book",
        name = "scheduler-enabled",
        havingValue = "true",
        matchIfMissing = true)
public class BookModerationSnapshotJob {
    private static final Logger log = LoggerFactory.getLogger(BookModerationSnapshotJob.class);

    private final BookModerationSnapshotService snapshotService;

    public BookModerationSnapshotJob(BookModerationSnapshotService snapshotService) {
        this.snapshotService = snapshotService;
    }

    @Scheduled(
            fixedDelayString = "${novel.audit.full-book.fixed-delay:PT15S}",
            initialDelayString = "${novel.audit.full-book.initial-delay:PT5S}")
    public void processWholeWorkSnapshots() {
        try {
            int processed = snapshotService.processAvailableChunks();
            if (processed > 0) {
                log.info("Processed {} whole-work moderation snapshot chunks", processed);
            }
        } catch (RuntimeException exception) {
            // The durable lease is intentionally left for a later retry instead of killing scheduling.
            log.error("Unable to process whole-work moderation snapshot chunks", exception);
        }
    }
}
