-- Recommendation placement is already represented by novel_book.editorial_rank (V18).  This
-- migration adds the operational guard, audit evidence, and the separately managed hot-search
-- vocabulary around that established source of truth.
ALTER TABLE novel_book ADD CONSTRAINT ck_novel_book_editorial_rank_operational_range
    CHECK (editorial_rank IS NULL OR editorial_rank <= 2000000);

-- Every order-changing action locks this one row before touching ranks.  The lock makes all
-- rank rewrites serial, including concurrent requests that ask for the same target position.
CREATE TABLE novel_editorial_operation_lock (
    id TINYINT NOT NULL PRIMARY KEY,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_editorial_operation_lock_id CHECK (id = 1)
);

INSERT INTO novel_editorial_operation_lock(id, updated_at) VALUES (1, CURRENT_TIMESTAMP);

-- The audit is intentionally not a foreign-key dependent of novel_book: a later legitimate
-- deletion must not erase or be blocked by the evidence of a past editorial decision.
CREATE TABLE novel_editorial_recommendation_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    action VARCHAR(24) NOT NULL,
    previous_rank INT NULL,
    new_rank INT NULL,
    details VARCHAR(1024) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_editorial_recommendation_audit_action
        CHECK (action IN ('ASSIGNED', 'REORDERED', 'REMOVED'))
);

CREATE INDEX idx_novel_editorial_recommendation_audit_book_created
    ON novel_editorial_recommendation_audit(book_id, created_at, id);
CREATE INDEX idx_novel_editorial_recommendation_audit_operator_created
    ON novel_editorial_recommendation_audit(operator_user_id, created_at, id);

CREATE TABLE novel_hot_search_term (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    normalized_term VARCHAR(100) NOT NULL,
    term VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    display_rank INT NOT NULL,
    created_by_user_id BIGINT NULL,
    updated_by_user_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_novel_hot_search_term_normalized UNIQUE (normalized_term),
    CONSTRAINT uk_novel_hot_search_term_display_rank UNIQUE (display_rank),
    -- Ranks 1..100000 are the public contract.  The upper interval is reserved only for the
    -- short-lived transactional parking step used to avoid unique-key collisions during moves.
    CONSTRAINT ck_novel_hot_search_term_display_rank CHECK (display_rank > 0 AND display_rank <= 2000000)
);

CREATE INDEX idx_novel_hot_search_term_public
    ON novel_hot_search_term(enabled, display_rank, id);

-- The audit intentionally has no foreign key to hot_search_term.  A deletion must preserve its
-- evidence after the live configuration row has gone away.
CREATE TABLE novel_hot_search_term_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    term_id BIGINT NOT NULL,
    term VARCHAR(100) NOT NULL,
    action VARCHAR(24) NOT NULL,
    previous_rank INT NULL,
    new_rank INT NULL,
    details VARCHAR(1024) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_hot_search_term_audit_action
        CHECK (action IN ('CREATED', 'UPDATED', 'REMOVED'))
);

CREATE INDEX idx_novel_hot_search_term_audit_term_created
    ON novel_hot_search_term_audit(term_id, created_at, id);
CREATE INDEX idx_novel_hot_search_term_audit_operator_created
    ON novel_hot_search_term_audit(operator_user_id, created_at, id);

-- Greenfield examples are deliberately ordinary search phrases.  They make the public discover
-- flow useful immediately, while administrators remain the sole source of subsequent changes.
INSERT INTO novel_hot_search_term(normalized_term, term, enabled, display_rank, created_at, updated_at) VALUES
    ('星海', '星海', TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('长安', '长安', TRUE, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('旧港', '旧港', TRUE, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
