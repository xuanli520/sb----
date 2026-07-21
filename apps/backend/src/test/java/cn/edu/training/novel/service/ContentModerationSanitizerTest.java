package cn.edu.training.novel.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ContentModerationSanitizerTest {
    @Test
    void redactsTheWholeAuthorizationBearerHeaderBeforeGenericKeyRedaction() {
        String sanitized = ContentModerationSanitizer.bounded(
                "provider returned Authorization: Bearer opaque-header-token", 256);

        assertThat(sanitized)
                .contains("Authorization: [REDACTED]")
                .doesNotContain("opaque-header-token");
    }

    @Test
    void exceptionSummaryNeverIncludesTheProviderMessage() {
        String summary = ContentModerationSanitizer.safeExceptionSummary(
                new IllegalStateException("Authorization: Bearer opaque-header-token; body=chapter text"));

        assertThat(summary)
                .startsWith("provider-error=IllegalStateException; message-sha256:")
                .doesNotContain("opaque-header-token", "chapter text");
    }
}
