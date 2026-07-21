-- A decision must retain the operator identity even for development principals that have no
-- novel_account row, so this deliberately has no account foreign key.
ALTER TABLE novel_author_application ADD COLUMN decided_by_user_id BIGINT NULL;

CREATE INDEX idx_novel_author_application_decided_by
    ON novel_author_application(decided_by_user_id, decided_at, id);
