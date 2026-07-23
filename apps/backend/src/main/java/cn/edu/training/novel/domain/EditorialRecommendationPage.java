package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Stable, zero-based page of stationmaster-managed editorial recommendations. */
public record EditorialRecommendationPage(List<EditorialRecommendation> items, PageMeta meta) {
    public EditorialRecommendationPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
