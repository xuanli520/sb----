package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Stable, zero-based page of editorial recommendation change evidence. */
public record EditorialRecommendationAuditPage(List<EditorialRecommendationAudit> items, PageMeta meta) {
    public EditorialRecommendationAuditPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
