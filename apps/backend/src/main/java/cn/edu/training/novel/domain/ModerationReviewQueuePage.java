package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Bounded operator view spanning whole-work review and incremental candidate decisions. */
public record ModerationReviewQueuePage(List<ModerationReviewQueueItem> items, PageMeta meta) {
    public ModerationReviewQueuePage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
