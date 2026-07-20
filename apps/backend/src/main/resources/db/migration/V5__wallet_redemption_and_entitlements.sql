-- Consumption is deliberately kept in a separate domain model from accounts.
-- Development identities and migrated RuoYi identities both use their stable user id here,
-- so these tables do not add a foreign key to novel_account.

CREATE TABLE novel_redemption_code (
    code VARCHAR(128) NOT NULL PRIMARY KEY,
    batch_no VARCHAR(64) NOT NULL,
    benefit_type VARCHAR(32) NOT NULL,
    token_amount BIGINT NOT NULL DEFAULT 0,
    book_id BIGINT NULL,
    membership_days INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    expires_at TIMESTAMP NULL,
    redeemed_by_user_id BIGINT NULL,
    redeemed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_redemption_code_token_amount CHECK (token_amount >= 0),
    CONSTRAINT ck_novel_redemption_code_membership_days CHECK (membership_days >= 0)
);

CREATE INDEX idx_novel_redemption_code_batch_status ON novel_redemption_code(batch_no, status);
CREATE INDEX idx_novel_redemption_code_expires_at ON novel_redemption_code(expires_at);

CREATE TABLE novel_token_balance (
    user_id BIGINT NOT NULL PRIMARY KEY,
    balance BIGINT NOT NULL DEFAULT 0,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_token_balance_non_negative CHECK (balance >= 0)
);

CREATE TABLE novel_token_ledger (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    change_amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    reference_type VARCHAR(32) NOT NULL,
    reference_id VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_token_ledger_balance_non_negative CHECK (balance_after >= 0),
    CONSTRAINT ck_novel_token_ledger_non_zero_change CHECK (change_amount <> 0)
);

CREATE INDEX idx_novel_token_ledger_user_created ON novel_token_ledger(user_id, created_at, id);
CREATE INDEX idx_novel_token_ledger_reference ON novel_token_ledger(reference_type, reference_id);

CREATE TABLE novel_book_entitlement (
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    source_type VARCHAR(32) NOT NULL,
    source_reference VARCHAR(128) NOT NULL,
    purchase_amount BIGINT NOT NULL DEFAULT 0,
    acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_novel_book_entitlement_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_book_entitlement_purchase_amount CHECK (purchase_amount >= 0)
);

CREATE INDEX idx_novel_book_entitlement_book ON novel_book_entitlement(book_id, acquired_at);

CREATE TABLE novel_reward_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rewarder_user_id BIGINT NOT NULL,
    author_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    amount BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_reward_record_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_reward_record_positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_novel_reward_record_book_created ON novel_reward_record(book_id, created_at, id);
CREATE INDEX idx_novel_reward_record_author_created ON novel_reward_record(author_id, created_at, id);
CREATE INDEX idx_novel_reward_record_rewarder_created ON novel_reward_record(rewarder_user_id, created_at, id);

-- Keep the pre-existing public demo flow available while making its lifecycle durable.
INSERT INTO novel_redemption_code(
    code, batch_no, benefit_type, token_amount, book_id, membership_days, status, expires_at, redeemed_by_user_id, redeemed_at, created_at, updated_at
) VALUES (
    'WELCOME100', 'SYSTEM-DEMO', 'TOKEN', 100, NULL, 0, 'ACTIVE', NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
