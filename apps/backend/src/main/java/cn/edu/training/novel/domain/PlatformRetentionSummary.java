package cn.edu.training.novel.domain;

/** Whole-platform roll-up for the selected cohort range. */
public record PlatformRetentionSummary(long activeReaderCount, RetentionMetric metric) {}
