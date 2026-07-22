package cn.edu.training.novel.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** JDBC persistence for the one station-owned SMTP override and its secret-free audit trail. */
@Repository
public class EmailDeliverySettingsRepository {
    private final JdbcTemplate jdbc;

    public EmailDeliverySettingsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<StoredSettings> find() {
        return query(false);
    }

    public Optional<StoredSettings> lock() {
        return query(true);
    }

    private Optional<StoredSettings> query(boolean forUpdate) {
        List<StoredSettings> settings = jdbc.query(
                "SELECT enabled, smtp_host, smtp_port, smtp_username, smtp_password_ciphertext, from_address, "
                        + "smtp_auth, ssl_enabled, verification_hash_secret_ciphertext, updated_by_user_id, updated_at "
                        + "FROM novel_email_delivery_settings WHERE id = 1" + (forUpdate ? " FOR UPDATE" : ""),
                (resultSet, rowNumber) -> new StoredSettings(
                        resultSet.getBoolean("enabled"),
                        resultSet.getString("smtp_host"),
                        resultSet.getInt("smtp_port"),
                        resultSet.getString("smtp_username"),
                        resultSet.getString("smtp_password_ciphertext"),
                        resultSet.getString("from_address"),
                        resultSet.getBoolean("smtp_auth"),
                        resultSet.getBoolean("ssl_enabled"),
                        resultSet.getString("verification_hash_secret_ciphertext"),
                        resultSet.getLong("updated_by_user_id"),
                        resultSet.getTimestamp("updated_at").toInstant()));
        return settings.stream().findFirst();
    }

    public void save(StoredSettings settings) {
        int updated = jdbc.update(
                "UPDATE novel_email_delivery_settings SET enabled = ?, smtp_host = ?, smtp_port = ?, smtp_username = ?, "
                        + "smtp_password_ciphertext = ?, from_address = ?, smtp_auth = ?, ssl_enabled = ?, "
                        + "verification_hash_secret_ciphertext = ?, updated_by_user_id = ?, updated_at = ? WHERE id = 1",
                settings.enabled(), settings.host(), settings.port(), settings.username(), settings.passwordCiphertext(),
                settings.from(), settings.smtpAuth(), settings.sslEnabled(), settings.verificationHashSecretCiphertext(),
                settings.updatedByUserId(), Timestamp.from(settings.updatedAt()));
        if (updated == 0) {
            jdbc.update(
                    "INSERT INTO novel_email_delivery_settings(id, enabled, smtp_host, smtp_port, smtp_username, "
                            + "smtp_password_ciphertext, from_address, smtp_auth, ssl_enabled, "
                            + "verification_hash_secret_ciphertext, updated_by_user_id, updated_at) "
                            + "VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    settings.enabled(), settings.host(), settings.port(), settings.username(), settings.passwordCiphertext(),
                    settings.from(), settings.smtpAuth(), settings.sslEnabled(), settings.verificationHashSecretCiphertext(),
                    settings.updatedByUserId(), Timestamp.from(settings.updatedAt()));
        }
    }

    public void recordAudit(
            String action,
            StoredSettings settings,
            String reason,
            String verificationRecipient,
            long operatorUserId) {
        jdbc.update(
                "INSERT INTO novel_email_delivery_settings_audit(action, smtp_host, smtp_port, smtp_username, from_address, "
                        + "smtp_auth, ssl_enabled, reason, verification_recipient, operator_user_id, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                action, settings.host(), settings.port(), settings.username(), settings.from(), settings.smtpAuth(),
                settings.sslEnabled(), reason, verificationRecipient, operatorUserId);
    }

    public record StoredSettings(
            boolean enabled,
            String host,
            int port,
            String username,
            String passwordCiphertext,
            String from,
            boolean smtpAuth,
            boolean sslEnabled,
            String verificationHashSecretCiphertext,
            long updatedByUserId,
            Instant updatedAt) {}
}
