package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Stable, zero-based page of hot-search term change evidence. */
public record HotSearchTermAuditPage(List<HotSearchTermAudit> items, PageMeta meta) {
    public HotSearchTermAuditPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
