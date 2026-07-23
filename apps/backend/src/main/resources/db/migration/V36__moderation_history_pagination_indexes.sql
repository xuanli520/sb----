-- The append-only operational history endpoints use deterministic descending pages.
CREATE INDEX idx_novel_content_moderation_recent
    ON novel_content_moderation_audit(started_at, id);
CREATE INDEX idx_novel_content_moderation_type_recent
    ON novel_content_moderation_audit(content_type, started_at, id);
CREATE INDEX idx_novel_book_moderation_snapshot_book_recent
    ON novel_book_moderation_snapshot(book_id, created_at, id);
