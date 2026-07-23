-- `novel_book.cover` predates managed media and only remains as a nullable migration-era column.
-- No runtime read or write path uses it after this migration; public covers resolve exclusively
-- through the binding registry below.
ALTER TABLE novel_book MODIFY COLUMN cover VARCHAR(1024) NULL;

-- Media assets are immutable objects. The catalog only stores their public projection while this
-- registry owns authorization, reference tracking, lifecycle evidence, and deferred cleanup.
CREATE TABLE novel_media_asset (
    id CHAR(36) NOT NULL PRIMARY KEY,
    owner_scope VARCHAR(16) NOT NULL,
    owner_user_id BIGINT NULL,
    purpose VARCHAR(32) NOT NULL,
    object_key VARCHAR(255) NOT NULL,
    -- Staged cover candidates intentionally have no public URL. Only approved cover/banner
    -- assets are projected into the `/media/` namespace.
    public_url VARCHAR(512) NULL,
    sha256 CHAR(64) NOT NULL,
    content_type VARCHAR(64) NOT NULL,
    width INT NOT NULL,
    height INT NOT NULL,
    byte_size BIGINT NOT NULL,
    label VARCHAR(128) NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT uk_novel_media_asset_object_key UNIQUE (object_key),
    CONSTRAINT ck_novel_media_asset_owner_scope CHECK (
        (owner_scope = 'PLATFORM' AND owner_user_id IS NULL)
        OR (owner_scope = 'AUTHOR' AND owner_user_id IS NOT NULL)
    ),
    CONSTRAINT ck_novel_media_asset_purpose CHECK (
        purpose IN ('BOOK_COVER', 'BOOK_COVER_CANDIDATE', 'HOME_CAROUSEL_BANNER')
    ),
    CONSTRAINT ck_novel_media_asset_state CHECK (
        state IN ('ACTIVE', 'ARCHIVED', 'PENDING_DELETE', 'DELETED')
    ),
    CONSTRAINT ck_novel_media_asset_dimensions CHECK (
        width > 0 AND height > 0 AND byte_size > 0
    )
);

CREATE INDEX idx_novel_media_asset_listing
    ON novel_media_asset(owner_scope, purpose, state, created_at, id);

-- Only live bindings are stored here. Historical use remains in the audit table, which avoids
-- preventing an old object from becoming eligible for deferred garbage collection.
CREATE TABLE novel_media_asset_binding (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id CHAR(36) NOT NULL,
    binding_type VARCHAR(32) NOT NULL,
    target_id BIGINT NOT NULL,
    created_by_user_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_novel_media_binding_target UNIQUE (binding_type, target_id),
    CONSTRAINT fk_novel_media_binding_asset FOREIGN KEY (asset_id) REFERENCES novel_media_asset(id),
    CONSTRAINT ck_novel_media_binding_type CHECK (
        binding_type IN ('BOOK_COVER', 'BOOK_COVER_CANDIDATE', 'HOME_CAROUSEL_BANNER')
    )
);

CREATE INDEX idx_novel_media_binding_asset
    ON novel_media_asset_binding(asset_id, binding_type, target_id);

CREATE TABLE novel_media_asset_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id CHAR(36) NOT NULL,
    action VARCHAR(32) NOT NULL,
    details VARCHAR(1024) NOT NULL,
    operator_user_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_media_asset_audit_action CHECK (
        action IN ('UPLOADED', 'BOUND', 'UNBOUND', 'ARCHIVED', 'RESTORED', 'PROMOTED', 'REJECTED', 'SUPERSEDED', 'DELETE_REQUESTED', 'DELETE_SUCCEEDED', 'DELETE_FAILED')
    )
);

CREATE INDEX idx_novel_media_asset_audit_asset_created
    ON novel_media_asset_audit(asset_id, created_at, id);

CREATE TABLE novel_media_gc_task (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id CHAR(36) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    due_at TIMESTAMP NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    last_error VARCHAR(1024) NULL,
    claimed_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_media_gc_asset FOREIGN KEY (asset_id) REFERENCES novel_media_asset(id),
    CONSTRAINT ck_novel_media_gc_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    CONSTRAINT ck_novel_media_gc_attempts CHECK (attempt_count >= 0)
);

CREATE INDEX idx_novel_media_gc_due
    ON novel_media_gc_task(status, due_at, id);

-- A published work keeps its currently bound public cover while a proposed replacement stays in
-- private object storage. The approved asset is a new immutable `covers/` object, never a rename
-- of the staged object, so a failed/rolled-back approval cannot affect public readers.
CREATE TABLE novel_book_cover_candidate (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    asset_id CHAR(36) NOT NULL,
    approved_asset_id CHAR(36) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING_REVIEW',
    review_reason VARCHAR(900) NULL,
    created_by_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by_user_id BIGINT NULL,
    reviewed_at TIMESTAMP NULL,
    CONSTRAINT uk_novel_book_cover_candidate_asset UNIQUE (asset_id),
    CONSTRAINT fk_novel_book_cover_candidate_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT fk_novel_book_cover_candidate_asset FOREIGN KEY (asset_id) REFERENCES novel_media_asset(id),
    CONSTRAINT fk_novel_book_cover_candidate_approved_asset FOREIGN KEY (approved_asset_id) REFERENCES novel_media_asset(id),
    CONSTRAINT ck_novel_book_cover_candidate_status CHECK (
        status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED')
    ),
    CONSTRAINT ck_novel_book_cover_candidate_resolution CHECK (
        (status = 'PENDING_REVIEW' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
        OR (status IN ('APPROVED', 'REJECTED', 'SUPERSEDED') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX idx_novel_book_cover_candidate_review_queue
    ON novel_book_cover_candidate(status, created_at, id);

CREATE INDEX idx_novel_book_cover_candidate_book_status
    ON novel_book_cover_candidate(book_id, status, id);

-- This lock makes carousel rank rewrites serial. The temporary rank range is intentionally shared
-- only by one transaction at a time, so the unique display rank remains valid at every commit.
CREATE TABLE novel_home_carousel_operation_lock (
    id TINYINT NOT NULL PRIMARY KEY,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_home_carousel_operation_lock_id CHECK (id = 1)
);

INSERT INTO novel_home_carousel_operation_lock(id, updated_at) VALUES (1, CURRENT_TIMESTAMP);

CREATE TABLE novel_home_carousel_slide (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    headline VARCHAR(255) NULL,
    copy_text VARCHAR(1024) NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    display_rank INT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_by_user_id BIGINT NULL,
    updated_by_user_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_novel_home_carousel_slide_book UNIQUE (book_id),
    CONSTRAINT uk_novel_home_carousel_slide_rank UNIQUE (display_rank),
    CONSTRAINT fk_novel_home_carousel_slide_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_home_carousel_slide_rank CHECK (display_rank > 0 AND display_rank <= 2000000)
);

CREATE INDEX idx_novel_home_carousel_public
    ON novel_home_carousel_slide(enabled, display_rank, id);

CREATE TABLE novel_home_carousel_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    slide_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    action VARCHAR(32) NOT NULL,
    details VARCHAR(1024) NOT NULL,
    operator_user_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_home_carousel_audit_action CHECK (
        action IN ('CREATED', 'UPDATED', 'REORDERED', 'ENABLED', 'DISABLED', 'REMOVED', 'AUTO_DISABLED')
    )
);

CREATE INDEX idx_novel_home_carousel_audit_slide_created
    ON novel_home_carousel_audit(slide_id, created_at, id);

-- Existing editorial placements were the legacy home carousel source. Migrate only currently
-- published items, without an artificial banner, so the public UI uses the bound cover when one
-- exists and its neutral fallback otherwise.
INSERT INTO novel_home_carousel_slide(
    book_id, headline, copy_text, enabled, display_rank, version, created_at, updated_at
)
SELECT id, NULL, NULL, TRUE, editorial_rank, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM novel_book
WHERE status = 'PUBLISHED' AND editorial_rank IS NOT NULL
ORDER BY editorial_rank ASC, id ASC
LIMIT 3;
