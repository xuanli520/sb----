-- Sensitive vocabulary used to be an append-only set. Keep its existing normalized-word key so
-- active moderation lookups remain fast, while adding an explicit lifecycle and immutable audit.
ALTER TABLE novel_sensitive_word ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE novel_sensitive_word ADD COLUMN created_by_user_id BIGINT NULL;
ALTER TABLE novel_sensitive_word ADD COLUMN updated_by_user_id BIGINT NULL;
ALTER TABLE novel_sensitive_word ADD COLUMN disabled_by_user_id BIGINT NULL;
ALTER TABLE novel_sensitive_word ADD COLUMN disabled_at TIMESTAMP NULL;

CREATE INDEX idx_novel_sensitive_word_enabled_normalized
    ON novel_sensitive_word(enabled, normalized_word);

CREATE TABLE novel_sensitive_word_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    normalized_word VARCHAR(128) NOT NULL,
    previous_word VARCHAR(128) NULL,
    word VARCHAR(128) NULL,
    previous_enabled BOOLEAN NULL,
    enabled BOOLEAN NULL,
    action VARCHAR(32) NOT NULL,
    reason VARCHAR(512) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_sensitive_word_audit_action CHECK (
        action IN ('CREATED', 'UPDATED', 'ENABLED', 'DISABLED', 'DELETED')
    )
);

CREATE INDEX idx_novel_sensitive_word_audit_created
    ON novel_sensitive_word_audit(created_at DESC, id DESC);
