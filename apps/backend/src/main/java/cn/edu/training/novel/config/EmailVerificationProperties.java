package cn.edu.training.novel.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Server-side policy for registration email verification. Secrets are read only by the service
 * and deliberately redacted from this configuration object's diagnostic representation.
 */
@ConfigurationProperties(prefix = "novel.email-verification")
public final class EmailVerificationProperties {
    private boolean enabled = true;
    private String from = "";
    private String hashSecret = "";
    private Duration codeTtl = Duration.ofMinutes(10);
    private Duration resendCooldown = Duration.ofMinutes(1);
    private int maxRequestsPerWindow = 5;
    private Duration requestWindow = Duration.ofHours(1);
    private int maxVerificationAttempts = 5;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getFrom() {
        return from;
    }

    public void setFrom(String from) {
        this.from = from;
    }

    public String getHashSecret() {
        return hashSecret;
    }

    public void setHashSecret(String hashSecret) {
        this.hashSecret = hashSecret;
    }

    public Duration getCodeTtl() {
        return codeTtl;
    }

    public void setCodeTtl(Duration codeTtl) {
        this.codeTtl = codeTtl;
    }

    public Duration getResendCooldown() {
        return resendCooldown;
    }

    public void setResendCooldown(Duration resendCooldown) {
        this.resendCooldown = resendCooldown;
    }

    public int getMaxRequestsPerWindow() {
        return maxRequestsPerWindow;
    }

    public void setMaxRequestsPerWindow(int maxRequestsPerWindow) {
        this.maxRequestsPerWindow = maxRequestsPerWindow;
    }

    public Duration getRequestWindow() {
        return requestWindow;
    }

    public void setRequestWindow(Duration requestWindow) {
        this.requestWindow = requestWindow;
    }

    public int getMaxVerificationAttempts() {
        return maxVerificationAttempts;
    }

    public void setMaxVerificationAttempts(int maxVerificationAttempts) {
        this.maxVerificationAttempts = maxVerificationAttempts;
    }

    /** Invalid deployment policy is handled as an unavailable capability at the endpoint. */
    public boolean hasValidPolicy() {
        return codeTtl != null
                && !codeTtl.isNegative()
                && !codeTtl.isZero()
                && resendCooldown != null
                && !resendCooldown.isNegative()
                && requestWindow != null
                && !requestWindow.isNegative()
                && !requestWindow.isZero()
                && maxRequestsPerWindow >= 1
                && maxRequestsPerWindow <= 20
                && maxVerificationAttempts >= 1
                && maxVerificationAttempts <= 10;
    }

    @Override
    public String toString() {
        return "EmailVerificationProperties[enabled=" + enabled
                + ", from=" + (hasText(from) ? "<configured>" : "<empty>")
                + ", hashSecret=" + (hasText(hashSecret) ? "<configured>" : "<empty>")
                + ", codeTtl=" + codeTtl
                + ", resendCooldown=" + resendCooldown
                + ", maxRequestsPerWindow=" + maxRequestsPerWindow
                + ", requestWindow=" + requestWindow
                + ", maxVerificationAttempts=" + maxVerificationAttempts + "]";
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
