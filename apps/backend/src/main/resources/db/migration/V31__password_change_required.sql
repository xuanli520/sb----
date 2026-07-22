ALTER TABLE novel_account
    ADD COLUMN password_change_required BOOLEAN NOT NULL DEFAULT FALSE AFTER password_hash;
