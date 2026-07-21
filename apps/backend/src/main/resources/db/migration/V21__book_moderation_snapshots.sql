-- A whole-work review must refer to immutable copied text, not rows that an author can edit while
-- a model request is in flight. These archival tables deliberately do not reference novel_book:
-- rejected works may later be removed while moderation evidence must remain available.
CREATE TABLE novel_book_moderation_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    content_version_hash VARCHAR(64) NOT NULL,
    book_title VARCHAR(255) NOT NULL,
    book_synopsis TEXT NOT NULL,
    status VARCHAR(16) NOT NULL,
    aggregate_decision VARCHAR(32) NULL,
    aggregate_reason VARCHAR(1024) NULL,
    total_chunks INT NOT NULL,
    completed_chunks INT NOT NULL DEFAULT 0,
    current_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at TIMESTAMP(6) NULL,
    CONSTRAINT ck_novel_book_moderation_snapshot_status
        CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'STALE')),
    CONSTRAINT ck_novel_book_moderation_snapshot_counts
        CHECK (total_chunks > 0 AND completed_chunks >= 0 AND completed_chunks <= total_chunks)
);

CREATE INDEX idx_novel_book_moderation_snapshot_current
    ON novel_book_moderation_snapshot(book_id, current_snapshot, created_at, id);
CREATE INDEX idx_novel_book_moderation_snapshot_queue
    ON novel_book_moderation_snapshot(current_snapshot, status, created_at, id);

CREATE TABLE novel_book_moderation_snapshot_chunk (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    snapshot_id BIGINT NOT NULL,
    source_chapter_id BIGINT NULL,
    chunk_sequence INT NOT NULL,
    chunk_title VARCHAR(1024) NOT NULL,
    chunk_content TEXT NOT NULL,
    content_version_hash VARCHAR(64) NOT NULL,
    input_characters INT NOT NULL,
    status VARCHAR(16) NOT NULL,
    claim_token VARCHAR(64) NULL,
    claimed_at TIMESTAMP(6) NULL,
    lease_expires_at TIMESTAMP(6) NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    moderation_audit_id BIGINT NULL,
    completed_at TIMESTAMP(6) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_novel_book_moderation_snapshot_chunk_snapshot
        FOREIGN KEY (snapshot_id) REFERENCES novel_book_moderation_snapshot(id),
    CONSTRAINT fk_novel_book_moderation_snapshot_chunk_audit
        FOREIGN KEY (moderation_audit_id) REFERENCES novel_content_moderation_audit(id),
    CONSTRAINT uk_novel_book_moderation_snapshot_chunk_sequence UNIQUE(snapshot_id, chunk_sequence),
    CONSTRAINT ck_novel_book_moderation_snapshot_chunk_status
        CHECK (status IN ('QUEUED', 'PROCESSING', 'COMPLETED')),
    CONSTRAINT ck_novel_book_moderation_snapshot_chunk_input_size CHECK (input_characters >= 0),
    CONSTRAINT ck_novel_book_moderation_snapshot_chunk_attempts CHECK (attempt_count >= 0)
);

CREATE INDEX idx_novel_book_moderation_snapshot_chunk_claim
    ON novel_book_moderation_snapshot_chunk(status, lease_expires_at, snapshot_id, chunk_sequence, id);
CREATE INDEX idx_novel_book_moderation_snapshot_chunk_audit
    ON novel_book_moderation_snapshot_chunk(moderation_audit_id);
