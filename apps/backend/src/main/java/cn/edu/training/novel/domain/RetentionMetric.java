package cn.edu.training.novel.domain;

/** Counts and eligibility-aware rates for a reader cohort. */
public record RetentionMetric(
        long cohortReaderCount,
        long day1EligibleReaderCount,
        long day1RetainedReaderCount,
        Double day1RetentionPercent,
        long day7EligibleReaderCount,
        long day7RetainedReaderCount,
        Double day7RetentionPercent) {}
