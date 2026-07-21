-- Author analytics joins current progress through book ownership and a bounded update window.
CREATE INDEX idx_novel_reader_progress_book_updated
    ON novel_reader_progress(book_id, updated_at, user_id);
