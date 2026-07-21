-- Interaction rows keep stable principal ids without an account foreign key so development
-- principals and future migrated identities share the same ownership boundary.

CREATE TABLE novel_comment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    chapter_id BIGINT NULL,
    user_id BIGINT NOT NULL,
    author_name VARCHAR(128) NOT NULL,
    content VARCHAR(4000) NOT NULL,
    status VARCHAR(32) NOT NULL,
    review_reason VARCHAR(1024) NOT NULL DEFAULT '',
    reviewed_by_user_id BIGINT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_comment_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT fk_novel_comment_chapter FOREIGN KEY (chapter_id) REFERENCES novel_chapter(id),
    CONSTRAINT ck_novel_comment_status CHECK (status IN ('PENDING_REVIEW', 'VISIBLE', 'REJECTED'))
);

CREATE INDEX idx_novel_comment_public ON novel_comment(book_id, status, created_at, id);
CREATE INDEX idx_novel_comment_chapter_public ON novel_comment(chapter_id, status, created_at, id);
CREATE INDEX idx_novel_comment_owner ON novel_comment(user_id, created_at, id);
CREATE INDEX idx_novel_comment_review_queue ON novel_comment(status, created_at, id);

CREATE TABLE novel_book_rating (
    book_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    rating SMALLINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id, user_id),
    CONSTRAINT fk_novel_book_rating_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_book_rating_range CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_novel_book_rating_owner ON novel_book_rating(user_id, updated_at, book_id);

CREATE TABLE novel_book_vote (
    book_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    vote_type VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (book_id, user_id, vote_type),
    CONSTRAINT fk_novel_book_vote_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_book_vote_type CHECK (vote_type IN ('recommendation', 'monthly'))
);

CREATE INDEX idx_novel_book_vote_owner ON novel_book_vote(user_id, vote_type, created_at, book_id);
CREATE INDEX idx_novel_book_vote_book_type ON novel_book_vote(book_id, vote_type, created_at);

-- This row is a transactionally maintained read model. Its primary key also gives mutations for
-- one book a single lock point, so rating totals and public vote/comment counts stay consistent.
CREATE TABLE novel_book_interaction_stat (
    book_id BIGINT NOT NULL PRIMARY KEY,
    visible_comment_count BIGINT NOT NULL DEFAULT 0,
    rating_count BIGINT NOT NULL DEFAULT 0,
    rating_total BIGINT NOT NULL DEFAULT 0,
    recommendation_vote_count BIGINT NOT NULL DEFAULT 0,
    monthly_vote_count BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_book_interaction_stat_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_book_interaction_stat_counts CHECK (
        visible_comment_count >= 0
        AND rating_count >= 0
        AND rating_total >= 0
        AND recommendation_vote_count >= 0
        AND monthly_vote_count >= 0
    )
);
