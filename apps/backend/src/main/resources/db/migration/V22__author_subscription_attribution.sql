-- Author subscription reporting only counts membership grants with an explicit work
-- attribution. A composite redemption code carries that attribution through book_id; the
-- author id is snapshotted here when the immutable membership ledger row is created.

CREATE TABLE novel_author_subscription_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    membership_ledger_id BIGINT NOT NULL,
    reader_user_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    membership_days INT NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    source_reference VARCHAR(128) NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    CONSTRAINT uq_novel_author_subscription_membership_ledger UNIQUE (membership_ledger_id),
    CONSTRAINT fk_novel_author_subscription_membership_ledger
        FOREIGN KEY (membership_ledger_id) REFERENCES novel_membership_ledger(id),
    CONSTRAINT fk_novel_author_subscription_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_author_subscription_positive_days CHECK (membership_days > 0)
);

CREATE INDEX idx_novel_author_subscription_author_occurred
    ON novel_author_subscription_ledger(author_id, occurred_at, id);
CREATE INDEX idx_novel_author_subscription_book_occurred
    ON novel_author_subscription_ledger(book_id, occurred_at, id);
CREATE INDEX idx_novel_author_subscription_reader_occurred
    ON novel_author_subscription_ledger(reader_user_id, occurred_at, id);
