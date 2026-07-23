package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Stable, zero-based page of immutable commercial-rule change evidence. */
public record CommercialRuleAuditPage(List<CommercialRuleAudit> items, PageMeta meta) {
    public CommercialRuleAuditPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
