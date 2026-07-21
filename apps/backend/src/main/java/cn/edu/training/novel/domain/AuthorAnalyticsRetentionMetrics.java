package cn.edu.training.novel.domain;

import java.time.LocalDate;

/**
 * Retention for reader-work cohorts. Null rates mean that no cohort had matured by the observation
 * boundary, rather than a zero-percent result.
 */
public record AuthorAnalyticsRetentionMetrics(
        long cohortReaderBookCount,
        long day1EligibleReaderBookCount,
        long day1RetainedReaderBookCount,
        Double day1RetentionPercent,
        long day7EligibleReaderBookCount,
        long day7RetainedReaderBookCount,
        Double day7RetentionPercent,
        LocalDate observedThrough) {}
