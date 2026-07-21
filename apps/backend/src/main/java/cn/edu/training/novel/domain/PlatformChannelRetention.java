package cn.edu.training.novel.domain;

/** A channel roll-up for the selected cohort range. */
public record PlatformChannelRetention(String channel, long activeReaderCount, RetentionMetric metric) {}
