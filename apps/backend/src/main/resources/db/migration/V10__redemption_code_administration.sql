-- Administrative redemption-code lifecycle data.  Account ids intentionally remain soft
-- references because development principals and migrated identities share this domain.
ALTER TABLE novel_redemption_code ADD COLUMN created_by_user_id BIGINT NULL;
ALTER TABLE novel_redemption_code ADD COLUMN disabled_by_user_id BIGINT NULL;
ALTER TABLE novel_redemption_code ADD COLUMN disabled_at TIMESTAMP NULL;

CREATE INDEX idx_novel_redemption_code_status_created
    ON novel_redemption_code(status, created_at, code);

CREATE TABLE novel_membership_entitlement (
    user_id BIGINT NOT NULL PRIMARY KEY,
    expires_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE novel_membership_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    membership_days INT NOT NULL,
    valid_from TIMESTAMP NOT NULL,
    valid_until TIMESTAMP NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    reference_type VARCHAR(32) NOT NULL,
    reference_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_membership_ledger_positive_days CHECK (membership_days > 0)
);

CREATE INDEX idx_novel_membership_ledger_user_created
    ON novel_membership_ledger(user_id, created_at, id);
CREATE INDEX idx_novel_membership_ledger_reference
    ON novel_membership_ledger(reference_type, reference_id);
