package cn.edu.training.novel.service;

import cn.edu.training.novel.config.EmailVerificationProperties;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Sends and consumes registration codes through a configured SMTP sender. This service has no
 * local-mail or plaintext-code fallback: unavailable configuration and sender failures are
 * deliberately represented as a 503 to the internal BFF.
 */
@Service
public class EmailVerificationService {
    private static final String REGISTRATION_PURPOSE = "REGISTRATION";
    private static final int CODE_LENGTH = 6;
    private static final Pattern EMAIL_ADDRESS = Pattern.compile(
            "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$");
    private static final Pattern VERIFICATION_CODE = Pattern.compile("[0-9]{" + CODE_LENGTH + "}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final JdbcTemplate jdbc;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final EmailVerificationProperties properties;
    private final String smtpHost;
    private final int smtpPort;
    private final String smtpUsername;
    private final String smtpPassword;

    public EmailVerificationService(
            JdbcTemplate jdbc,
            ObjectProvider<JavaMailSender> mailSenderProvider,
            EmailVerificationProperties properties,
            @Value("${spring.mail.host:}") String smtpHost,
            @Value("${spring.mail.port:0}") int smtpPort,
            @Value("${spring.mail.username:}") String smtpUsername,
            @Value("${spring.mail.password:}") String smtpPassword) {
        this.jdbc = jdbc;
        this.mailSenderProvider = mailSenderProvider;
        this.properties = properties;
        this.smtpHost = smtpHost;
        this.smtpPort = smtpPort;
        this.smtpUsername = smtpUsername;
        this.smtpPassword = smtpPassword;
    }

    /**
     * Creates a current one-time code only after all SMTP readiness checks pass. The verification
     * state write and SMTP call share a transaction so a failed send cannot leave a usable code.
     */
    @Transactional
    public VerificationDelivery requestRegistrationCode(String requestedEmail) {
        String email = normalizeEmail(requestedEmail);
        JavaMailSender mailSender = requireAvailableSender();
        Instant now = Instant.now();
        Optional<VerificationRow> current = lockCurrent(email);
        RequestWindow requestWindow = nextRequestWindow(current.orElse(null), now);
        String code = generateCode();
        Instant expiresAt = now.plus(properties.getCodeTtl());

        if (current.isPresent()) {
            jdbc.update(
                    "UPDATE novel_email_verification "
                            + "SET code_hash = ?, expires_at = ?, used_at = NULL, sent_at = ?, "
                            + "request_window_started_at = ?, request_count = ?, verification_attempts = 0, "
                            + "last_attempt_at = NULL, updated_at = ? WHERE id = ?",
                    codeHash(email, code),
                    Timestamp.from(expiresAt),
                    Timestamp.from(now),
                    Timestamp.from(requestWindow.startedAt()),
                    requestWindow.count(),
                    Timestamp.from(now),
                    current.get().id());
        } else {
            insertCurrent(email, codeHash(email, code), now, expiresAt, requestWindow);
        }

        try {
            mailSender.send(registrationMessage(email, code));
        } catch (RuntimeException exception) {
            // SMTP provider details can contain credentials or recipient data and must not reach
            // logs or the API. The transaction rolls the verification write back before 503.
            throw unavailable();
        }
        return new VerificationDelivery(expiresAt, now.plus(properties.getResendCooldown()));
    }

    /** Consumes the latest valid code exactly once, under a database row lock. */
    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = ResponseStatusException.class)
    public void consumeRegistrationCode(String requestedEmail, String rawCode) {
        String email = normalizeEmail(requestedEmail);
        requireAvailableSender();
        if (rawCode == null || !VERIFICATION_CODE.matcher(rawCode).matches()) {
            throw invalidCode();
        }
        VerificationRow current = lockCurrent(email).orElseThrow(EmailVerificationService::invalidCode);
        Instant now = Instant.now();
        if (current.usedAt() != null || !current.expiresAt().isAfter(now)) {
            throw invalidCode();
        }
        if (current.verificationAttempts() >= properties.getMaxVerificationAttempts()) {
            throw attemptsExceeded();
        }
        String expectedHash = codeHash(email, rawCode);
        if (!MessageDigest.isEqual(
                current.codeHash().getBytes(StandardCharsets.US_ASCII), expectedHash.getBytes(StandardCharsets.US_ASCII))) {
            int nextAttempts = current.verificationAttempts() + 1;
            jdbc.update(
                    "UPDATE novel_email_verification SET verification_attempts = ?, last_attempt_at = ?, updated_at = ? WHERE id = ?",
                    nextAttempts,
                    Timestamp.from(now),
                    Timestamp.from(now),
                    current.id());
            if (nextAttempts >= properties.getMaxVerificationAttempts()) {
                throw attemptsExceeded();
            }
            throw invalidCode();
        }
        int consumed = jdbc.update(
                "UPDATE novel_email_verification "
                        + "SET used_at = ?, verification_attempts = ?, last_attempt_at = ?, updated_at = ? "
                        + "WHERE id = ? AND used_at IS NULL AND expires_at > ?",
                Timestamp.from(now),
                current.verificationAttempts() + 1,
                Timestamp.from(now),
                Timestamp.from(now),
                current.id(),
                Timestamp.from(now));
        if (consumed != 1) {
            throw invalidCode();
        }
    }

    /** Whether a platform login name is an email address requiring the BFF registration gate. */
    public static boolean isEmailAddress(String candidate) {
        if (candidate == null) {
            return false;
        }
        String normalized = candidate.trim();
        return normalized.length() <= 120 && EMAIL_ADDRESS.matcher(normalized).matches();
    }

    public static boolean isVerificationCode(String candidate) {
        return candidate != null && VERIFICATION_CODE.matcher(candidate).matches();
    }

    private void insertCurrent(String email, String codeHash, Instant now, Instant expiresAt, RequestWindow requestWindow) {
        try {
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO novel_email_verification("
                                + "email, purpose, code_hash, expires_at, used_at, sent_at, request_window_started_at, "
                                + "request_count, verification_attempts, last_attempt_at, created_at, updated_at) "
                                + "VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 0, NULL, ?, ?)");
                statement.setString(1, email);
                statement.setString(2, REGISTRATION_PURPOSE);
                statement.setString(3, codeHash);
                statement.setTimestamp(4, Timestamp.from(expiresAt));
                statement.setTimestamp(5, Timestamp.from(now));
                statement.setTimestamp(6, Timestamp.from(requestWindow.startedAt()));
                statement.setInt(7, requestWindow.count());
                statement.setTimestamp(8, Timestamp.from(now));
                statement.setTimestamp(9, Timestamp.from(now));
                return statement;
            });
        } catch (DataIntegrityViolationException exception) {
            // A concurrent first request may create the subject row. Do not send a second code
            // without a lock; the BFF can retry after the brief contention window.
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "verification request is already in progress");
        }
    }

    private Optional<VerificationRow> lockCurrent(String email) {
        List<VerificationRow> rows = jdbc.query(
                "SELECT id, code_hash, expires_at, used_at, sent_at, request_window_started_at, request_count, verification_attempts "
                        + "FROM novel_email_verification WHERE email = ? AND purpose = ? FOR UPDATE",
                (resultSet, rowNumber) -> new VerificationRow(
                        resultSet.getLong("id"),
                        resultSet.getString("code_hash"),
                        resultSet.getTimestamp("expires_at").toInstant(),
                        timestamp(resultSet, "used_at"),
                        resultSet.getTimestamp("sent_at").toInstant(),
                        resultSet.getTimestamp("request_window_started_at").toInstant(),
                        resultSet.getInt("request_count"),
                        resultSet.getInt("verification_attempts")),
                email,
                REGISTRATION_PURPOSE);
        return rows.stream().findFirst();
    }

    private RequestWindow nextRequestWindow(VerificationRow current, Instant now) {
        if (current == null) {
            return new RequestWindow(now, 1);
        }
        if (current.sentAt().plus(properties.getResendCooldown()).isAfter(now)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "verification code was sent recently");
        }
        if (!current.requestWindowStartedAt().plus(properties.getRequestWindow()).isAfter(now)) {
            return new RequestWindow(now, 1);
        }
        if (current.requestCount() >= properties.getMaxRequestsPerWindow()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "verification request limit reached");
        }
        return new RequestWindow(current.requestWindowStartedAt(), current.requestCount() + 1);
    }

    private JavaMailSender requireAvailableSender() {
        if (!properties.isEnabled()
                || !properties.hasValidPolicy()
                || !isEmailAddress(properties.getFrom())
                || !hasText(properties.getHashSecret())
                || !hasText(smtpHost)
                || smtpPort < 1
                || !hasText(smtpUsername)
                || !hasText(smtpPassword)) {
            throw unavailable();
        }
        try {
            JavaMailSender sender = mailSenderProvider.getIfAvailable();
            if (sender == null) {
                throw unavailable();
            }
            return sender;
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    private SimpleMailMessage registrationMessage(String email, String code) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.getFrom().trim());
        message.setTo(email);
        message.setSubject("小说平台邮箱验证码");
        message.setText("你的注册验证码是：" + code + "\n验证码将在有效期内失效，请勿向他人透露。");
        return message;
    }

    private String codeHash(String email, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.getHashSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal((REGISTRATION_PURPOSE + "\0" + email + "\0" + code).getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException | InvalidKeyException exception) {
            throw unavailable();
        }
    }

    private static String generateCode() {
        return String.format(Locale.ROOT, "%0" + CODE_LENGTH + "d", RANDOM.nextInt(1_000_000));
    }

    private static String normalizeEmail(String requestedEmail) {
        if (!isEmailAddress(requestedEmail)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "a valid email address is required");
        }
        return requestedEmail.trim().toLowerCase(Locale.ROOT);
    }

    private static Instant timestamp(java.sql.ResultSet resultSet, String column) throws java.sql.SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "email verification service is unavailable");
    }

    private static ResponseStatusException invalidCode() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "verification code is invalid or expired");
    }

    private static ResponseStatusException attemptsExceeded() {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "too many verification attempts; request a new code");
    }

    public record VerificationDelivery(Instant expiresAt, Instant resendAvailableAt) {}

    private record RequestWindow(Instant startedAt, int count) {}

    private record VerificationRow(
            long id,
            String codeHash,
            Instant expiresAt,
            Instant usedAt,
            Instant sentAt,
            Instant requestWindowStartedAt,
            int requestCount,
            int verificationAttempts) {}
}
