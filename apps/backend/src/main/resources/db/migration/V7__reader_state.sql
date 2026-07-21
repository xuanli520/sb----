-- Reader data uses stable principal ids rather than a foreign key to novel_account. This keeps
-- development identities and future migrated identities on the same durable ownership boundary.

CREATE TABLE novel_reader_bookshelf (
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_novel_reader_bookshelf_book FOREIGN KEY (book_id) REFERENCES novel_book(id)
);

CREATE INDEX idx_novel_reader_bookshelf_book ON novel_reader_bookshelf(book_id, added_at);

CREATE TABLE novel_reader_daily_checkin (
    user_id BIGINT NOT NULL,
    checkin_date DATE NOT NULL,
    awarded_points BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, checkin_date),
    CONSTRAINT ck_novel_reader_daily_checkin_points CHECK (awarded_points > 0)
);

CREATE TABLE novel_reader_point_balance (
    user_id BIGINT NOT NULL PRIMARY KEY,
    points BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_reader_point_balance_non_negative CHECK (points >= 0)
);

CREATE TABLE novel_reader_preference (
    user_id BIGINT NOT NULL PRIMARY KEY,
    theme VARCHAR(16) NOT NULL,
    font_family VARCHAR(64) NOT NULL,
    font_size INT NOT NULL,
    line_height INT NOT NULL,
    brightness INT NOT NULL,
    page_mode VARCHAR(16) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE novel_reader_progress (
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    chapter_id BIGINT NOT NULL,
    character_offset INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_novel_reader_progress_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT fk_novel_reader_progress_chapter FOREIGN KEY (chapter_id) REFERENCES novel_chapter(id),
    CONSTRAINT ck_novel_reader_progress_offset CHECK (character_offset >= 0)
);

CREATE INDEX idx_novel_reader_progress_user_updated ON novel_reader_progress(user_id, updated_at, book_id);

CREATE TABLE novel_reader_bookmark (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    chapter_id BIGINT NOT NULL,
    character_offset INT NOT NULL,
    note VARCHAR(2000) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_reader_bookmark_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT fk_novel_reader_bookmark_chapter FOREIGN KEY (chapter_id) REFERENCES novel_chapter(id),
    CONSTRAINT ck_novel_reader_bookmark_offset CHECK (character_offset >= 0)
);

CREATE INDEX idx_novel_reader_bookmark_owner ON novel_reader_bookmark(user_id, book_id, created_at, id);
