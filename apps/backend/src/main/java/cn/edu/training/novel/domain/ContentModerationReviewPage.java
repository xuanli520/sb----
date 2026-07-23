package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Bounded history of human decisions for one work. */
public record ContentModerationReviewPage(List<ContentModerationReview> items, PageMeta meta) {
    public ContentModerationReviewPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
