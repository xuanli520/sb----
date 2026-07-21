-- A human decision is immutable evidence attached to the exact moderation attempt it reviewed.
-- book_id is a denormalized archival identifier so review rows remain available when a rejected
-- work is later deleted; the moderation-audit foreign key preserves the actual evidence link.
CREATE TABLE novel_content_moderation_review (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    moderation_audit_id BIGINT NOT NULL,
    reviewer_user_id BIGINT NOT NULL,
    decision VARCHAR(16) NOT NULL,
    reason VARCHAR(900) NOT NULL,
    reviewed_at TIMESTAMP(6) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_novel_content_moderation_review_audit
        FOREIGN KEY (moderation_audit_id) REFERENCES novel_content_moderation_audit(id),
    CONSTRAINT ck_novel_content_moderation_review_decision
        CHECK (decision IN ('APPROVED', 'REJECTED'))
);

CREATE INDEX idx_novel_content_moderation_review_book
    ON novel_content_moderation_review(book_id, reviewed_at, id);
CREATE INDEX idx_novel_content_moderation_review_audit
    ON novel_content_moderation_review(moderation_audit_id, reviewed_at, id);
