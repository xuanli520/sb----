package cn.edu.training.novel.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Bounded, non-secret policy settings for automatic content screening.
 *
 * <p>The development simulation is deliberately opt-in. It exists for local and test workflows
 * where a DashScope workspace is not available, and every simulated result is persisted as such.
 */
@Validated
@ConfigurationProperties(prefix = "novel.audit.moderation")
public record ContentModerationProperties(
        @NotBlank @DefaultValue("content-safety-v1") String policyVersion,
        @NotBlank @DefaultValue("qwen-chapter-json-v1") String promptVersion,
        @Min(512) @Max(40_000) @DefaultValue("24000") int maxInputCharacters,
        @Min(256) @Max(8_192) @DefaultValue("4096") int maxResponseCharacters,
        boolean developmentSimulationEnabled) {
}
