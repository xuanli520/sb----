package cn.edu.training.novel.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class EmailVerificationPropertiesTest {
    @Test
    void invalidPolicyIsUnavailableAndDiagnosticOutputNeverIncludesTheHashSecret() {
        EmailVerificationProperties properties = new EmailVerificationProperties();
        properties.setHashSecret("actual-hmac-secret-must-not-appear");
        properties.setCodeTtl(Duration.ZERO);
        properties.setMaxRequestsPerWindow(0);

        assertThat(properties.hasValidPolicy()).isFalse();
        assertThat(properties.toString()).doesNotContain("actual-hmac-secret-must-not-appear");
    }
}
