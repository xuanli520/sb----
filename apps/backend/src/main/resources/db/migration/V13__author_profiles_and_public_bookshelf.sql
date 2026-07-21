-- An approved application is the source of truth for the pen name used on newly created works.
-- The profile deliberately does not reference novel_account so development identities retain the
-- same durable ownership model used by the catalog and reader-state tables.

CREATE TABLE novel_author_profile (
    user_id BIGINT NOT NULL PRIMARY KEY,
    pen_name VARCHAR(128) NOT NULL,
    approved_application_id BIGINT NOT NULL UNIQUE,
    approved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_author_profile_application
        FOREIGN KEY (approved_application_id) REFERENCES novel_author_application(id)
);
