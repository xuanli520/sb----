-- Incremental changes must not make an already public work disappear. A candidate captures the
-- exact proposed content and moderation evidence while the existing chapter remains readable.
CREATE TABLE novel_chapter_candidate (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    target_chapter_id BIGINT NOT NULL,
    volume_id BIGINT NULL,
    candidate_type VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    order_no INT NOT NULL,
    status VARCHAR(32) NOT NULL,
    review_reason VARCHAR(1024) NOT NULL DEFAULT '',
    moderation_audit_id BIGINT NULL,
    created_by_user_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    reviewed_by_user_id BIGINT NULL,
    reviewed_at TIMESTAMP(6) NULL,
    CONSTRAINT fk_novel_chapter_candidate_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT fk_novel_chapter_candidate_target
        FOREIGN KEY (target_chapter_id) REFERENCES novel_chapter(id),
    CONSTRAINT fk_novel_chapter_candidate_volume
        FOREIGN KEY (volume_id) REFERENCES novel_volume(id),
    CONSTRAINT fk_novel_chapter_candidate_audit
        FOREIGN KEY (moderation_audit_id) REFERENCES novel_content_moderation_audit(id),
    CONSTRAINT ck_novel_chapter_candidate_type
        CHECK (candidate_type IN ('NEW_CHAPTER', 'CHAPTER_REVISION')),
    CONSTRAINT ck_novel_chapter_candidate_status
        CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    CONSTRAINT ck_novel_chapter_candidate_order CHECK (order_no > 0)
);

CREATE INDEX idx_novel_chapter_candidate_review_queue
    ON novel_chapter_candidate(status, created_at, id);
CREATE INDEX idx_novel_chapter_candidate_book
    ON novel_chapter_candidate(book_id, created_at, id);
CREATE INDEX idx_novel_chapter_candidate_target
    ON novel_chapter_candidate(target_chapter_id, status, id);
