-- Administrator-entered SMTP secrets are AES-GCM ciphertext under a deployment-owned key.
-- The singleton row overrides environment SMTP values only after a station administrator saves it.
CREATE TABLE novel_email_delivery_settings (
    id INT PRIMARY KEY,
    enabled BOOLEAN NOT NULL,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_username VARCHAR(255) NOT NULL,
    smtp_password_ciphertext VARCHAR(2048) NOT NULL,
    from_address VARCHAR(320) NOT NULL,
    smtp_auth BOOLEAN NOT NULL,
    ssl_enabled BOOLEAN NOT NULL,
    verification_hash_secret_ciphertext VARCHAR(2048) NOT NULL,
    updated_by_user_id BIGINT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_email_delivery_settings_singleton CHECK (id = 1),
    CONSTRAINT ck_novel_email_delivery_settings_port CHECK (smtp_port BETWEEN 1 AND 65535)
);

CREATE TABLE novel_email_delivery_settings_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(32) NOT NULL,
    smtp_host VARCHAR(255) NOT NULL,
    smtp_port INT NOT NULL,
    smtp_username VARCHAR(255) NOT NULL,
    from_address VARCHAR(320) NOT NULL,
    smtp_auth BOOLEAN NOT NULL,
    ssl_enabled BOOLEAN NOT NULL,
    reason VARCHAR(512) NOT NULL,
    verification_recipient VARCHAR(320) NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_email_delivery_settings_audit_action CHECK (action IN ('UPDATED', 'VERIFIED'))
);

CREATE INDEX idx_novel_email_delivery_settings_audit_created
    ON novel_email_delivery_settings_audit(created_at DESC, id DESC);
