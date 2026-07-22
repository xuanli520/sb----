package cn.edu.training.novel.service;

import cn.edu.training.novel.config.EmailVerificationProperties;
import cn.edu.training.novel.domain.EmailDeliverySettings;
import cn.edu.training.novel.domain.EmailDeliverySettingsView;
import java.time.Instant;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resolves deployment SMTP defaults and the stationmaster-super-administrator override. Browser callers only
 * receive {@link EmailDeliverySettingsView}; credentials are encrypted at rest and never read
 * back into an API response.
 */
@Service
public class EmailDeliverySettingsService {
    private static final int MAX_HOST_LENGTH = 255;
    private static final int MAX_USERNAME_LENGTH = 255;
    private static final int MAX_FROM_LENGTH = 320;
    private static final int MAX_SECRET_LENGTH = 1_024;
    private static final int MAX_REASON_LENGTH = 512;

    private final EmailDeliverySettingsRepository repository;
    private final EmailDeliverySettingsCipher cipher;
    private final EmailDeliverySenderFactory senderFactory;
    private final EmailVerificationProperties verificationProperties;
    private final String deploymentHost;
    private final int deploymentPort;
    private final String deploymentUsername;
    private final String deploymentPassword;
    private final boolean deploymentSmtpAuth;
    private final boolean deploymentSslEnabled;

    public EmailDeliverySettingsService(
            EmailDeliverySettingsRepository repository,
            EmailDeliverySettingsCipher cipher,
            EmailDeliverySenderFactory senderFactory,
            EmailVerificationProperties verificationProperties,
            @Value("${spring.mail.host:}") String deploymentHost,
            @Value("${spring.mail.port:0}") int deploymentPort,
            @Value("${spring.mail.username:}") String deploymentUsername,
            @Value("${spring.mail.password:}") String deploymentPassword,
            @Value("${NOVEL_SMTP_AUTH:true}") boolean deploymentSmtpAuth,
            @Value("${NOVEL_SMTP_SSL_ENABLE:true}") boolean deploymentSslEnabled) {
        this.repository = repository;
        this.cipher = cipher;
        this.senderFactory = senderFactory;
        this.verificationProperties = verificationProperties;
        this.deploymentHost = deploymentHost;
        this.deploymentPort = deploymentPort;
        this.deploymentUsername = deploymentUsername;
        this.deploymentPassword = deploymentPassword;
        this.deploymentSmtpAuth = deploymentSmtpAuth;
        this.deploymentSslEnabled = deploymentSslEnabled;
    }

    /** Returns a redacted configuration projection to the sole stationmaster role only. */
    public EmailDeliverySettingsView currentView(CurrentUser operator) {
        requireStationmaster(operator);
        Optional<EmailDeliverySettingsRepository.StoredSettings> stored = repository.find();
        if (stored.isPresent()) {
            EmailDeliverySettingsRepository.StoredSettings settings = stored.get();
            return new EmailDeliverySettingsView(
                    EmailDeliverySettings.Source.ADMIN.name(),
                    settings.enabled(), settings.host(), settings.port(), settings.username(), settings.from(),
                    settings.smtpAuth(), settings.sslEnabled(), hasText(settings.passwordCiphertext()),
                    hasText(settings.verificationHashSecretCiphertext()), settings.updatedByUserId(), settings.updatedAt());
        }
        return new EmailDeliverySettingsView(
                EmailDeliverySettings.Source.DEPLOYMENT.name(),
                verificationProperties.isEnabled(), trim(deploymentHost), deploymentPort, trim(deploymentUsername),
                trim(verificationProperties.getFrom()), deploymentSmtpAuth, deploymentSslEnabled,
                hasText(deploymentPassword), hasText(verificationProperties.getHashSecret()), null, null);
    }

    /** Resolves complete server-only settings for the sender and verification-code HMAC. */
    public EmailDeliverySettings effectiveSettings() {
        Optional<EmailDeliverySettingsRepository.StoredSettings> stored = repository.find();
        if (stored.isPresent()) {
            EmailDeliverySettingsRepository.StoredSettings settings = stored.get();
            return new EmailDeliverySettings(
                    EmailDeliverySettings.Source.ADMIN,
                    settings.enabled(), settings.host(), settings.port(), settings.username(),
                    cipher.decrypt(settings.passwordCiphertext()), settings.from(), settings.smtpAuth(), settings.sslEnabled(),
                    cipher.decrypt(settings.verificationHashSecretCiphertext()), settings.updatedByUserId(), settings.updatedAt());
        }
        return new EmailDeliverySettings(
                EmailDeliverySettings.Source.DEPLOYMENT,
                verificationProperties.isEnabled(), trim(deploymentHost), deploymentPort, trim(deploymentUsername),
                deploymentPassword, trim(verificationProperties.getFrom()), deploymentSmtpAuth, deploymentSslEnabled,
                verificationProperties.getHashSecret(), null, null);
    }

    @Transactional
    public EmailDeliverySettingsView update(CurrentUser operator, UpdateCommand command) {
        long operatorUserId = requireStationmaster(operator);
        if (!cipher.isConfigured()) {
            throw encryptionUnavailable();
        }
        String host = boundedRequired(command.host(), "SMTP host is required", MAX_HOST_LENGTH);
        int port = command.port();
        if (port < 1 || port > 65_535) {
            throw badRequest("SMTP port must be between 1 and 65535");
        }
        String username = boundedRequired(command.username(), "SMTP username is required", MAX_USERNAME_LENGTH);
        String from = boundedRequired(command.from(), "SMTP from address is required", MAX_FROM_LENGTH);
        if (!EmailVerificationService.isEmailAddress(from)) {
            throw badRequest("SMTP from address must be a valid email address");
        }
        String reason = boundedRequired(command.reason(), "SMTP settings change reason is required", MAX_REASON_LENGTH);
        Optional<EmailDeliverySettingsRepository.StoredSettings> existing = repository.lock();
        String password = chooseSecret(command.password(), existing.map(EmailDeliverySettingsRepository.StoredSettings::passwordCiphertext), "SMTP password is required");
        String verificationHashSecret = chooseSecret(
                command.verificationHashSecret(),
                existing.map(EmailDeliverySettingsRepository.StoredSettings::verificationHashSecretCiphertext),
                "email verification HMAC secret is required");
        Instant now = Instant.now();
        EmailDeliverySettingsRepository.StoredSettings saved = new EmailDeliverySettingsRepository.StoredSettings(
                command.enabled(), host, port, username, cipher.encrypt(password), from, command.smtpAuth(), command.sslEnabled(),
                cipher.encrypt(verificationHashSecret), operatorUserId, now);
        repository.save(saved);
        repository.recordAudit("UPDATED", saved, reason, null, operatorUserId);
        return view(saved);
    }

    @Transactional
    public void verifyDelivery(CurrentUser operator, String recipient) {
        long operatorUserId = requireStationmaster(operator);
        String normalizedRecipient = boundedRequired(recipient, "verification recipient is required", MAX_FROM_LENGTH);
        if (!EmailVerificationService.isEmailAddress(normalizedRecipient)) {
            throw badRequest("verification recipient must be a valid email address");
        }
        EmailDeliverySettings settings = effectiveSettings();
        if (!settings.isComplete()) {
            throw unavailable();
        }
        JavaMailSender sender = senderFactory.create(settings);
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(settings.from());
            message.setTo(normalizedRecipient);
            message.setSubject("小说平台 SMTP 配置验证");
            message.setText("站长已验证当前 SMTP 邮件服务配置。此邮件不包含登录或注册验证码。");
            sender.send(message);
        } catch (RuntimeException exception) {
            throw unavailable();
        }
        EmailDeliverySettingsRepository.StoredSettings audited = repository.find()
                .orElseThrow(EmailDeliverySettingsService::unavailable);
        repository.recordAudit("VERIFIED", audited, "SMTP configuration verification delivered", normalizedRecipient, operatorUserId);
    }

    private EmailDeliverySettingsView view(EmailDeliverySettingsRepository.StoredSettings settings) {
        return new EmailDeliverySettingsView(
                EmailDeliverySettings.Source.ADMIN.name(), settings.enabled(), settings.host(), settings.port(),
                settings.username(), settings.from(), settings.smtpAuth(), settings.sslEnabled(), true, true,
                settings.updatedByUserId(), settings.updatedAt());
    }

    private String chooseSecret(
            String candidate,
            Optional<String> existingCiphertext,
            String requiredMessage) {
        if (candidate != null && !candidate.isBlank()) {
            return boundedRequired(candidate, requiredMessage, MAX_SECRET_LENGTH);
        }
        if (existingCiphertext.isPresent()) {
            return cipher.decrypt(existingCiphertext.get());
        }
        throw badRequest(requiredMessage);
    }

    private static long requireStationmaster(CurrentUser operator) {
        if (operator == null) {
            throw new SecurityException("stationmaster identity is required");
        }
        operator.requireSuperAdministrator();
        if (operator.id() < 1) {
            throw new SecurityException("stationmaster identity is required");
        }
        return operator.id();
    }

    private static String boundedRequired(String value, String message, int maximumLength) {
        if (value == null || value.isBlank()) {
            throw badRequest(message);
        }
        String normalized = value.trim();
        if (normalized.length() > maximumLength) {
            throw badRequest(message + " is too long");
        }
        if (normalized.chars().anyMatch(Character::isISOControl)) {
            throw badRequest(message + " contains control characters");
        }
        return normalized;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "email verification service is unavailable");
    }

    private static ResponseStatusException encryptionUnavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "administrator SMTP settings encryption is unavailable");
    }

    public record UpdateCommand(
            boolean enabled,
            String host,
            int port,
            String username,
            String password,
            String from,
            boolean smtpAuth,
            boolean sslEnabled,
            String verificationHashSecret,
            String reason) {}
}
