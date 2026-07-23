package cn.edu.training.novel.service;

import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Performs recoverable object-store cleanup after the media deletion grace period. */
@Component
public class MediaAssetGarbageCollector {
    private final MediaAssetService mediaAssets;

    public MediaAssetGarbageCollector(MediaAssetService mediaAssets) {
        this.mediaAssets = mediaAssets;
    }

    @Scheduled(
            fixedDelayString = "${novel.media-gc.fixed-delay:PT15M}",
            initialDelayString = "${novel.media-gc.initial-delay:PT2M}")
    public void collect() {
        for (MediaCarouselRepository.MediaGcTask task : mediaAssets.claimDueGcTasks(Instant.now(), 10)) {
            mediaAssets.completeGcTask(task, null);
        }
    }
}
