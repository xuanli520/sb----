package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Bounded immutable history for administrator vocabulary changes. */
public record SensitiveWordAuditPage(List<SensitiveWordAudit> items, PageMeta meta) {
    public SensitiveWordAuditPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
