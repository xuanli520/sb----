package cn.edu.training.novel.config;

import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Deterministic deployment mode used for security gates that must not be unlocked by an active
 * Spring profile alone.
 */
@Validated
@ConfigurationProperties(prefix = "novel")
public record NovelRuntimeProperties(
        @NotNull @DefaultValue("PRODUCTION") NovelRuntimeMode runtimeMode) {

    public boolean allowsDevelopmentSimulation() {
        return runtimeMode.allowsDevelopmentSimulation();
    }
}
