-- Authors can give the station owner a reasoned recommendation for a pending interaction on one
-- of their own books. These rows never change reader-visible moderation state; the administrator
-- remains the sole final approver or rejecter.
CREATE TABLE novel_author_comment_moderation_advice (
    comment_id BIGINT NOT NULL PRIMARY KEY,
    book_id BIGINT NOT NULL,
    author_user_id BIGINT NOT NULL,
    recommendation VARCHAR(32) NOT NULL,
    reason VARCHAR(1024) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_author_comment_advice_comment
        FOREIGN KEY (comment_id) REFERENCES novel_comment(id),
    CONSTRAINT fk_novel_author_comment_advice_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_author_comment_advice_recommendation
        CHECK (recommendation IN ('RECOMMEND_VISIBLE', 'RECOMMEND_REJECTED'))
);

CREATE INDEX idx_novel_author_comment_advice_book
    ON novel_author_comment_moderation_advice(book_id, updated_at, comment_id);

CREATE TABLE novel_author_annotation_moderation_advice (
    annotation_id BIGINT NOT NULL PRIMARY KEY,
    book_id BIGINT NOT NULL,
    author_user_id BIGINT NOT NULL,
    recommendation VARCHAR(32) NOT NULL,
    reason VARCHAR(1024) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_author_annotation_advice_annotation
        FOREIGN KEY (annotation_id) REFERENCES novel_paragraph_annotation(id),
    CONSTRAINT fk_novel_author_annotation_advice_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_author_annotation_advice_recommendation
        CHECK (recommendation IN ('RECOMMEND_VISIBLE', 'RECOMMEND_REJECTED'))
);

CREATE INDEX idx_novel_author_annotation_advice_book
    ON novel_author_annotation_moderation_advice(book_id, updated_at, annotation_id);
