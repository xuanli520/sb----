package cn.edu.training.novel.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/** Bounded queue and chunk settings for immutable whole-work moderation snapshots. */
@Validated
@ConfigurationProperties(prefix = "novel.audit.full-book")
public record FullBookModerationProperties(
        @Min(256) @Max(20_000) @DefaultValue("12000") int maxChunkCharacters,
        @Min(1) @Max(1_000) @DefaultValue("256") int maxChunks,
        @Min(1_024) @Max(5_000_000) @DefaultValue("1000000") int maxSnapshotCharacters,
        @Min(1) @Max(100) @DefaultValue("8") int maxClaimsPerRun,
        @NotNull @DefaultValue("PT2M") Duration claimLease,
        @DefaultValue("true") boolean schedulerEnabled,
        @NotNull @DefaultValue("PT15S") Duration fixedDelay,
        @NotNull @DefaultValue("PT5S") Duration initialDelay) {
}
