-- A moderation row is intentionally independent from a chapter foreign key. Audit evidence must
-- survive deletion of an unpublished draft, while the version hash avoids storing novel text here.
CREATE TABLE novel_content_moderation_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    content_type VARCHAR(32) NOT NULL,
    content_id BIGINT NOT NULL,
    content_version_hash VARCHAR(64) NOT NULL,
    audit_trigger VARCHAR(64) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    model_name VARCHAR(255) NULL,
    decision VARCHAR(64) NOT NULL,
    reason VARCHAR(1024) NOT NULL,
    policy_version VARCHAR(128) NOT NULL,
    prompt_version VARCHAR(128) NOT NULL,
    input_characters INT NOT NULL,
    request_id VARCHAR(128) NOT NULL,
    raw_response VARCHAR(4096) NULL,
    error_summary VARCHAR(1024) NULL,
    simulated BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMP(6) NOT NULL,
    completed_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT ck_novel_content_moderation_audit_input_size CHECK (input_characters >= 0),
    CONSTRAINT ck_novel_content_moderation_audit_time CHECK (completed_at >= started_at)
);

CREATE INDEX idx_novel_content_moderation_content
    ON novel_content_moderation_audit(content_type, content_id, started_at, id);
CREATE INDEX idx_novel_content_moderation_queue
    ON novel_content_moderation_audit(decision, started_at, id);
