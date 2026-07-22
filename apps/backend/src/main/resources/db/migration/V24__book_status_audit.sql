CREATE TABLE novel_book_status_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    action VARCHAR(32) NOT NULL,
    previous_status VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    reason VARCHAR(1024) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_book_status_audit_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_book_status_audit_action
        CHECK (action IN ('TAKEDOWN', 'RESTORE_FOR_REVIEW')),
    CONSTRAINT ck_novel_book_status_audit_previous_status
        CHECK (previous_status IN ('PUBLISHED', 'OFFLINE')),
    CONSTRAINT ck_novel_book_status_audit_status
        CHECK (status IN ('PENDING_REVIEW', 'OFFLINE'))
);

CREATE INDEX idx_novel_book_status_audit_book_created
    ON novel_book_status_audit(book_id, created_at, id);
