-- Immutable reader activity is the source of truth for retention.  The application derives
-- activity_date in Asia/Shanghai before writing so reporting does not depend on a database
-- server's session time zone.  One progress event per reader/work/day is sufficient for
-- D1/D7 retention and bounds high-frequency reader progress writes.
CREATE TABLE novel_reader_activity_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    chapter_id BIGINT NULL,
    event_type VARCHAR(32) NOT NULL,
    activity_date DATE NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    CONSTRAINT ck_novel_reader_activity_event_type
        CHECK (event_type IN ('READING_PROGRESS')),
    CONSTRAINT uk_novel_reader_activity_event_daily
        UNIQUE (user_id, book_id, event_type, activity_date)
);

CREATE INDEX idx_novel_reader_activity_event_user_date
    ON novel_reader_activity_event(user_id, activity_date, id);
CREATE INDEX idx_novel_reader_activity_event_date_user
    ON novel_reader_activity_event(activity_date, user_id, id);
CREATE INDEX idx_novel_reader_activity_event_book_user_date
    ON novel_reader_activity_event(book_id, user_id, activity_date, id);

-- Channel attribution is first-touch only. The small dictionary is a portable whitelist across
-- H2 and MySQL; it avoids depending on H2's unstable IN-check evaluation in long-running pools.
-- It stores a controlled category, not an IP address, referrer, campaign URL, device fingerprint,
-- or browser identifier. Existing accounts and development principals intentionally resolve to
-- DIRECT in read queries when no row exists.
CREATE TABLE novel_acquisition_channel (
    channel VARCHAR(32) NOT NULL PRIMARY KEY
);

INSERT INTO novel_acquisition_channel(channel) VALUES
    ('DIRECT'),
    ('ORGANIC'),
    ('SEARCH'),
    ('WECHAT'),
    ('QQ'),
    ('DOUYIN'),
    ('XIAOHONGSHU'),
    ('INVITE');

CREATE TABLE novel_channel_attribution (
    user_id BIGINT NOT NULL PRIMARY KEY,
    channel VARCHAR(32) NOT NULL,
    attribution_source VARCHAR(32) NOT NULL,
    attributed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_channel_attribution_channel
        FOREIGN KEY (channel) REFERENCES novel_acquisition_channel(channel),
    CONSTRAINT ck_novel_channel_attribution_source
        CHECK (attribution_source = 'REGISTRATION')
);

CREATE INDEX idx_novel_channel_attribution_channel_user
    ON novel_channel_attribution(channel, user_id);
