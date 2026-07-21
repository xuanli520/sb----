-- A paragraph annotation is anchored to one exact slice of a published chapter.  The copied
-- excerpt is kept only after the service verified it against the current chapter source, so a
-- browser cannot attach arbitrary text to a public annotation.
CREATE TABLE novel_paragraph_annotation (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    chapter_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    author_name VARCHAR(128) NOT NULL,
    paragraph_index INT NOT NULL,
    selection_start INT NOT NULL,
    selection_end INT NOT NULL,
    selected_text VARCHAR(2000) NOT NULL,
    note VARCHAR(2000) NOT NULL DEFAULT '',
    share_intent BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(32) NOT NULL,
    review_reason VARCHAR(1024) NOT NULL DEFAULT '',
    reviewed_by_user_id BIGINT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_paragraph_annotation_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT fk_novel_paragraph_annotation_chapter
        FOREIGN KEY (chapter_id) REFERENCES novel_chapter(id),
    CONSTRAINT ck_novel_paragraph_annotation_position CHECK (
        paragraph_index >= 0
        AND selection_start >= 0
        AND selection_end > selection_start
    ),
    CONSTRAINT ck_novel_paragraph_annotation_status CHECK (
        status IN ('PRIVATE', 'PENDING_REVIEW', 'VISIBLE', 'REJECTED')
    ),
    CONSTRAINT ck_novel_paragraph_annotation_share_status CHECK (
        (share_intent = FALSE AND status = 'PRIVATE')
        OR (share_intent = TRUE AND status IN ('PENDING_REVIEW', 'VISIBLE', 'REJECTED'))
    )
);

CREATE INDEX idx_novel_paragraph_annotation_owner
    ON novel_paragraph_annotation(user_id, created_at, id);
CREATE INDEX idx_novel_paragraph_annotation_public
    ON novel_paragraph_annotation(book_id, chapter_id, status, created_at, id);
CREATE INDEX idx_novel_paragraph_annotation_review_queue
    ON novel_paragraph_annotation(status, created_at, id);
