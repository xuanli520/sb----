package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Page plus token-only aggregate for an author's successful reward records. */
public record AuthorRewardReport(
        List<AuthorRewardRecord> items,
        AuthorRewardSummary summary,
        AuthorRewardReportMetadata meta) {
    public AuthorRewardReport {
        items = List.copyOf(items);
        Objects.requireNonNull(summary, "summary");
        Objects.requireNonNull(meta, "meta");
    }
}
