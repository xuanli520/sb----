package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Stable, zero-based page of stationmaster-managed hot-search terms. */
public record HotSearchTermPage(List<HotSearchTerm> items, PageMeta meta) {
    public HotSearchTermPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
