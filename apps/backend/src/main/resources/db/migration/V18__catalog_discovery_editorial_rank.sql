-- Editorial rank is deliberately independent from heat. Editors can curate a deterministic
-- placement while the hot list remains a transparent ordering of the persisted heat signal.
ALTER TABLE novel_book ADD COLUMN editorial_rank INT NULL;
ALTER TABLE novel_book ADD CONSTRAINT ck_novel_book_editorial_rank_positive
    CHECK (editorial_rank IS NULL OR editorial_rank > 0);
CREATE UNIQUE INDEX uk_novel_book_editorial_rank ON novel_book(editorial_rank);
CREATE INDEX idx_novel_book_public_editorial ON novel_book(status, editorial_rank, heat, id);
CREATE INDEX idx_novel_book_public_filters ON novel_book(status, category, serial_status, word_count, heat, id);

-- Initial greenfield catalog placements. Later operations may update the same persisted rank.
UPDATE novel_book SET editorial_rank = 1 WHERE id = 1;
UPDATE novel_book SET editorial_rank = 2 WHERE id = 3;
UPDATE novel_book SET editorial_rank = 3 WHERE id = 2;
