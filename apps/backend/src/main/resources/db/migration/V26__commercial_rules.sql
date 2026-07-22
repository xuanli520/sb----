-- D-10 commercial rules are a singleton so every write observes one durable, audited policy.
-- The defaults retain the former redemption membership ceiling and introduce conservative
-- reader quotas without changing the token ledger or entitlement history.

CREATE TABLE novel_commercial_rule (
    id BIGINT NOT NULL PRIMARY KEY,
    membership_days_maximum_per_code INT NOT NULL,
    recommendation_votes_per_day INT NOT NULL,
    monthly_votes_per_month INT NOT NULL,
    reward_minimum_tokens BIGINT NOT NULL,
    reward_maximum_tokens_per_reward BIGINT NOT NULL,
    reward_maximum_tokens_per_day BIGINT NOT NULL,
    updated_by_user_id BIGINT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_commercial_rule_singleton CHECK (id = 1),
    CONSTRAINT ck_novel_commercial_rule_membership_days CHECK (membership_days_maximum_per_code BETWEEN 1 AND 36500),
    CONSTRAINT ck_novel_commercial_rule_recommendation_votes CHECK (recommendation_votes_per_day BETWEEN 0 AND 100),
    CONSTRAINT ck_novel_commercial_rule_monthly_votes CHECK (monthly_votes_per_month BETWEEN 0 AND 100),
    CONSTRAINT ck_novel_commercial_rule_reward_minimum CHECK (reward_minimum_tokens BETWEEN 1 AND 1000000),
    CONSTRAINT ck_novel_commercial_rule_reward_per_reward CHECK (reward_maximum_tokens_per_reward BETWEEN 1 AND 1000000),
    CONSTRAINT ck_novel_commercial_rule_reward_per_day CHECK (reward_maximum_tokens_per_day BETWEEN 1 AND 5000000),
    CONSTRAINT ck_novel_commercial_rule_reward_bounds CHECK (
        reward_minimum_tokens <= reward_maximum_tokens_per_reward
        AND reward_maximum_tokens_per_reward <= reward_maximum_tokens_per_day
    )
);

INSERT INTO novel_commercial_rule(
    id,
    membership_days_maximum_per_code,
    recommendation_votes_per_day,
    monthly_votes_per_month,
    reward_minimum_tokens,
    reward_maximum_tokens_per_reward,
    reward_maximum_tokens_per_day,
    updated_by_user_id,
    updated_at
) VALUES (1, 36500, 10, 5, 1, 1000000, 5000000, NULL, CURRENT_TIMESTAMP);

-- Store both snapshots rather than a prose-only diff. This keeps an administrative decision
-- reconstructable even after the active singleton has changed again.
CREATE TABLE novel_commercial_rule_audit (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    previous_membership_days_maximum_per_code INT NOT NULL,
    previous_recommendation_votes_per_day INT NOT NULL,
    previous_monthly_votes_per_month INT NOT NULL,
    previous_reward_minimum_tokens BIGINT NOT NULL,
    previous_reward_maximum_tokens_per_reward BIGINT NOT NULL,
    previous_reward_maximum_tokens_per_day BIGINT NOT NULL,
    previous_updated_at TIMESTAMP NOT NULL,
    membership_days_maximum_per_code INT NOT NULL,
    recommendation_votes_per_day INT NOT NULL,
    monthly_votes_per_month INT NOT NULL,
    reward_minimum_tokens BIGINT NOT NULL,
    reward_maximum_tokens_per_reward BIGINT NOT NULL,
    reward_maximum_tokens_per_day BIGINT NOT NULL,
    reason VARCHAR(512) NOT NULL,
    operator_user_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_novel_commercial_rule_audit_membership_days CHECK (
        previous_membership_days_maximum_per_code BETWEEN 1 AND 36500
        AND membership_days_maximum_per_code BETWEEN 1 AND 36500
    ),
    CONSTRAINT ck_novel_commercial_rule_audit_reward_bounds CHECK (
        previous_reward_minimum_tokens <= previous_reward_maximum_tokens_per_reward
        AND previous_reward_maximum_tokens_per_reward <= previous_reward_maximum_tokens_per_day
        AND reward_minimum_tokens <= reward_maximum_tokens_per_reward
        AND reward_maximum_tokens_per_reward <= reward_maximum_tokens_per_day
    )
);

CREATE INDEX idx_novel_commercial_rule_audit_created ON novel_commercial_rule_audit(created_at DESC, id DESC);

-- These are transactionally maintained quota windows. They make the configured limits safe
-- under concurrent reader requests while the immutable token ledger remains the money record.
CREATE TABLE novel_vote_quota_usage (
    user_id BIGINT NOT NULL,
    vote_type VARCHAR(32) NOT NULL,
    window_start DATE NOT NULL,
    used_count INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, vote_type, window_start),
    CONSTRAINT ck_novel_vote_quota_usage_type CHECK (vote_type IN ('recommendation', 'monthly')),
    CONSTRAINT ck_novel_vote_quota_usage_count CHECK (used_count >= 0)
);

CREATE TABLE novel_reward_daily_usage (
    user_id BIGINT NOT NULL,
    usage_date DATE NOT NULL,
    used_tokens BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, usage_date),
    CONSTRAINT ck_novel_reward_daily_usage_tokens CHECK (used_tokens >= 0)
);
