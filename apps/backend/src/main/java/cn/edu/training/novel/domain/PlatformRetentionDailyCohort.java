package cn.edu.training.novel.domain;

import java.time.LocalDate;

/** One first-reading-date cohort, split by its immutable acquisition channel. */
public record PlatformRetentionDailyCohort(LocalDate cohortDate, String channel, RetentionMetric metric) {}
