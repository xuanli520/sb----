package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Paged audit history for the isolated historical-review recovery workflow. */
public record LegacyReviewTriageAuditPage(List<LegacyReviewTriageAudit> items, PageMeta meta) {
    public LegacyReviewTriageAuditPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
