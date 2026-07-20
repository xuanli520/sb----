CREATE TABLE novel_audit_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(1024) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_novel_audit_event_created_at ON novel_audit_event (created_at);
