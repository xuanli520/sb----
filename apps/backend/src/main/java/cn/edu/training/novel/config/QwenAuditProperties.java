package cn.edu.training.novel.config;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Non-secret Qwen audit settings. The DashScope key is deliberately owned only by Spring
 * AI's {@code spring.ai.openai.chat.api-key} property and is never copied into this object.
 */
@Validated
@ConfigurationProperties(prefix = "novel.audit.qwen")
public record QwenAuditProperties(
        boolean enabled,
        @DefaultValue("") String baseUrl,
        @DefaultValue("") String model,
        @NotNull @DefaultValue("PT20S") Duration timeout,
        @Min(0) @Max(3) @DefaultValue("0") int maxRetries,
        @Min(1) @Max(10_000) @DefaultValue("60") int maxRequestsPerMinute) {

    /**
     * Returns a validated provider endpoint without making invalid operator input fatal at
     * application start. The moderation workflow will hold content for human review instead.
     */
    public Optional<URI> compatibleBaseUrl() {
        if (baseUrl == null || baseUrl.isBlank()) {
            return Optional.empty();
        }
        try {
            URI endpoint = URI.create(baseUrl.trim());
            return isHttpsEndpoint(endpoint) ? Optional.of(endpoint) : Optional.empty();
        } catch (IllegalArgumentException ignored) {
            return Optional.empty();
        }
    }

    public boolean isConfiguredWhenEnabled() {
        return !enabled || (compatibleBaseUrl().isPresent() && hasModel());
    }

    public boolean hasModel() {
        return model != null && !model.isBlank();
    }

    private static boolean isHttpsEndpoint(URI endpoint) {
        return endpoint != null
                && "https".equalsIgnoreCase(endpoint.getScheme())
                && endpoint.getHost() != null
                && endpoint.getUserInfo() == null;
    }
}
