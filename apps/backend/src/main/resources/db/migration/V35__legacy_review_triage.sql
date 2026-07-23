-- NEEDS_REVIEW was used by a retired whole-book workflow. Keep historical records isolated and
-- require a stationmaster's explicit, auditable decision; this migration intentionally performs
-- no bulk status change.
CREATE TABLE novel_legacy_review_triage_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    action VARCHAR(32) NOT NULL,
    previous_status VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    reason VARCHAR(900) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_legacy_review_triage_audit_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_legacy_review_triage_audit_action
        CHECK (action IN ('REQUEUE_FOR_REVIEW', 'REJECT')),
    CONSTRAINT ck_novel_legacy_review_triage_audit_previous_status
        CHECK (previous_status = 'NEEDS_REVIEW'),
    CONSTRAINT ck_novel_legacy_review_triage_audit_status
        CHECK (status IN ('PENDING_REVIEW', 'REJECTED'))
);

CREATE INDEX idx_novel_legacy_review_triage_audit_book_created
    ON novel_legacy_review_triage_audit(book_id, created_at, id);
