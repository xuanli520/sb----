-- A single current registration verification state per address is enough to make a code
-- one-time while bounding retention of authentication data. The code itself is never persisted:
-- code_hash is an HMAC-SHA-256 digest with a deployment-owned secret.
CREATE TABLE novel_email_verification (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(120) NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    sent_at TIMESTAMP NOT NULL,
    request_window_started_at TIMESTAMP NOT NULL,
    request_count INT NOT NULL,
    verification_attempts INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_novel_email_verification_subject UNIQUE (email, purpose),
    CONSTRAINT ck_novel_email_verification_purpose CHECK (purpose = 'REGISTRATION'),
    CONSTRAINT ck_novel_email_verification_request_count CHECK (request_count >= 1),
    CONSTRAINT ck_novel_email_verification_attempts CHECK (verification_attempts >= 0)
);

CREATE INDEX idx_novel_email_verification_expiry
    ON novel_email_verification(expires_at, used_at);
