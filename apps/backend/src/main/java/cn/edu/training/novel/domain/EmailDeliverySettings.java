package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * Server-only effective SMTP configuration. Secret fields must never be serialized to a browser
 * response, audit record, or log message.
 */
public record EmailDeliverySettings(
        Source source,
        boolean enabled,
        String host,
        int port,
        String username,
        String password,
        String from,
        boolean smtpAuth,
        boolean sslEnabled,
        String verificationHashSecret,
        Long updatedByUserId,
        Instant updatedAt) {
    public enum Source { DEPLOYMENT, ADMIN }

    public boolean isComplete() {
        return enabled
                && host != null && !host.isBlank()
                && port >= 1 && port <= 65_535
                && username != null && !username.isBlank()
                && password != null && !password.isBlank()
                && from != null && !from.isBlank()
                && verificationHashSecret != null && !verificationHashSecret.isBlank();
    }
}
