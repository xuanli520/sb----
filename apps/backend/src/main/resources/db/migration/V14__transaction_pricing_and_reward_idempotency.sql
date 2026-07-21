-- Client-supplied purchase amounts are advisory at most. A published work owns its durable,
-- positive token price so a modified browser request cannot choose the debit amount.
ALTER TABLE novel_book ADD COLUMN purchase_price BIGINT NOT NULL DEFAULT 30;
ALTER TABLE novel_book ADD CONSTRAINT ck_novel_book_purchase_price_positive CHECK (purchase_price > 0);

-- Legacy V5 reward rows predate request keys and remain readable. New reward writes always set
-- this value; the scoped unique index is the durable idempotency boundary for a reward request.
ALTER TABLE novel_reward_record ADD COLUMN idempotency_key VARCHAR(128) NULL;
CREATE UNIQUE INDEX uk_novel_reward_record_rewarder_idempotency
    ON novel_reward_record(rewarder_user_id, idempotency_key);
