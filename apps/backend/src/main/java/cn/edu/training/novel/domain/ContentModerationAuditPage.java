package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Bounded operator view of durable automated moderation attempts. */
public record ContentModerationAuditPage(List<ContentModerationAudit> items, PageMeta meta) {
    public ContentModerationAuditPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
