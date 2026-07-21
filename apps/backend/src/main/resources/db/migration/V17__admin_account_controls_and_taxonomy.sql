-- Administrative account decisions need their own immutable evidence.  The account row remains
-- the source of truth for the current enabled state; this table records who made each decision
-- and why, including decisions made by a development administrator without a persisted account.
CREATE TABLE novel_account_status_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    previous_enabled BOOLEAN NOT NULL,
    enabled BOOLEAN NOT NULL,
    reason VARCHAR(1024) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_account_status_audit_account
        FOREIGN KEY (account_id) REFERENCES novel_account(id),
    CONSTRAINT ck_novel_account_status_audit_transition
        CHECK (previous_enabled <> enabled)
);

CREATE INDEX idx_novel_account_status_audit_account_created
    ON novel_account_status_audit(account_id, created_at, id);
CREATE INDEX idx_novel_account_status_audit_operator_created
    ON novel_account_status_audit(operator_user_id, created_at, id);

-- Taxonomy is deliberately an operations-owned configuration.  Existing books retain their
-- stored category text, while author/catalog work can consume this canonical vocabulary later
-- without making an operator change rewrite published work history.
CREATE TABLE novel_operating_taxonomy (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    taxonomy_type VARCHAR(16) NOT NULL,
    normalized_name VARCHAR(128) NOT NULL,
    name VARCHAR(128) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_by_user_id BIGINT NULL,
    updated_by_user_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_novel_operating_taxonomy_type_name UNIQUE (taxonomy_type, normalized_name),
    CONSTRAINT ck_novel_operating_taxonomy_type CHECK (taxonomy_type IN ('CATEGORY', 'TAG')),
    CONSTRAINT ck_novel_operating_taxonomy_sort_order CHECK (sort_order >= 0)
);

CREATE INDEX idx_novel_operating_taxonomy_listing
    ON novel_operating_taxonomy(taxonomy_type, enabled, sort_order, id);

-- This audit is intentionally independent from a taxonomy foreign key so it remains evidence if
-- a future retention policy ever removes an obsolete configuration row.
CREATE TABLE novel_operating_taxonomy_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    taxonomy_id BIGINT NOT NULL,
    taxonomy_type VARCHAR(16) NOT NULL,
    action VARCHAR(16) NOT NULL,
    details VARCHAR(1024) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_operating_taxonomy_audit_type CHECK (taxonomy_type IN ('CATEGORY', 'TAG')),
    CONSTRAINT ck_novel_operating_taxonomy_audit_action CHECK (action IN ('CREATED', 'UPDATED'))
);

CREATE INDEX idx_novel_operating_taxonomy_audit_item_created
    ON novel_operating_taxonomy_audit(taxonomy_type, taxonomy_id, created_at, id);

INSERT INTO novel_operating_taxonomy(
    taxonomy_type, normalized_name, name, enabled, sort_order, created_at, updated_at
) VALUES
    ('CATEGORY', '科幻', '科幻', TRUE, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CATEGORY', '悬疑', '悬疑', TRUE, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('CATEGORY', '古言', '古言', TRUE, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
