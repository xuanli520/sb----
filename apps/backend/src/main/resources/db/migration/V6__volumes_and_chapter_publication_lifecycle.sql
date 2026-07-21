CREATE TABLE novel_volume (
    id BIGINT NOT NULL PRIMARY KEY,
    book_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    order_no INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_volume_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT uk_novel_volume_book_order UNIQUE (book_id, order_no)
);

CREATE INDEX idx_novel_volume_book_order ON novel_volume(book_id, order_no, id);

INSERT INTO novel_catalog_sequence(sequence_name, next_value) VALUES ('volume', 1);

ALTER TABLE novel_chapter ADD COLUMN volume_id BIGINT NULL;
ALTER TABLE novel_chapter ADD COLUMN status VARCHAR(32) NOT NULL DEFAULT 'DRAFT';
ALTER TABLE novel_chapter ADD COLUMN scheduled_publish_at TIMESTAMP(6) NULL;
ALTER TABLE novel_chapter ADD COLUMN published_at TIMESTAMP(6) NULL;
ALTER TABLE novel_chapter ADD COLUMN review_reason VARCHAR(1024) NOT NULL DEFAULT '';

UPDATE novel_chapter
SET status = CASE WHEN published THEN 'PUBLISHED' ELSE 'DRAFT' END,
    published_at = CASE WHEN published THEN CURRENT_TIMESTAMP ELSE NULL END;

ALTER TABLE novel_chapter
    ADD CONSTRAINT fk_novel_chapter_volume FOREIGN KEY (volume_id) REFERENCES novel_volume(id);

CREATE INDEX idx_novel_chapter_volume_order ON novel_chapter(volume_id, order_no, id);
CREATE INDEX idx_novel_chapter_schedule ON novel_chapter(status, scheduled_publish_at, id);
