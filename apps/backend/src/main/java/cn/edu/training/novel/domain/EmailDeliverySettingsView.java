package cn.edu.training.novel.domain;

import java.time.Instant;

/** Credential-free projection for the administrator configuration screen. */
public record EmailDeliverySettingsView(
        String source,
        boolean enabled,
        String host,
        int port,
        String username,
        String from,
        boolean smtpAuth,
        boolean sslEnabled,
        boolean passwordConfigured,
        boolean verificationHashSecretConfigured,
        Long updatedByUserId,
        Instant updatedAt) {}
