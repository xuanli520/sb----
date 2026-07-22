-- D-05 records the exact retry boundary that was in force when an administrator rejected an
-- application. The nullable shape preserves pre-policy decisions; application code derives their
-- boundary from the active deployment policy until they are superseded by a later application.
ALTER TABLE novel_author_application ADD COLUMN reapply_available_at TIMESTAMP NULL;

CREATE INDEX idx_novel_author_application_reapply
    ON novel_author_application(user_id, status, reapply_available_at, id);
