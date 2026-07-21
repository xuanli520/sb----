-- Operations data is separate from the generic account tables because development identities and
-- future migrated identities can submit applications without a direct account foreign key.

CREATE TABLE novel_author_application (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    pending_user_id BIGINT NULL,
    pen_name VARCHAR(128) NOT NULL,
    statement VARCHAR(4000) NOT NULL,
    status VARCHAR(32) NOT NULL,
    decision_reason VARCHAR(1024) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_novel_author_application_pending_user UNIQUE (pending_user_id),
    CONSTRAINT ck_novel_author_application_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX idx_novel_author_application_queue ON novel_author_application(status, created_at, id);
CREATE INDEX idx_novel_author_application_user ON novel_author_application(user_id, created_at, id);

CREATE TABLE novel_sensitive_word (
    normalized_word VARCHAR(128) NOT NULL PRIMARY KEY,
    word VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO novel_sensitive_word(normalized_word, word, created_at, updated_at)
VALUES ('敏感词', '敏感词', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
