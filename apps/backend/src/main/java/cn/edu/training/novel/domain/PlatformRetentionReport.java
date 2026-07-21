package cn.edu.training.novel.domain;

import java.util.List;

public record PlatformRetentionReport(
        PlatformRetentionSummary summary,
        List<PlatformRetentionDailyCohort> dailyCohorts,
        List<PlatformChannelRetention> channels,
        PlatformRetentionMetadata meta) {
    public PlatformRetentionReport {
        dailyCohorts = List.copyOf(dailyCohorts);
        channels = List.copyOf(channels);
    }
}
