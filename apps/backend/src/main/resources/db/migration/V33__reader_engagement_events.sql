-- Free book subscriptions are reader follow state, independent from membership, payment and
-- reading entitlement.  The state table answers current counts; the append-only event table
-- preserves adds and cancellations for report windows.
CREATE TABLE novel_book_subscription (
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    subscribed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_novel_book_subscription_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id)
);

CREATE INDEX idx_novel_book_subscription_book
    ON novel_book_subscription(book_id, subscribed_at, user_id);

CREATE TABLE novel_book_subscription_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_novel_book_subscription_event_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_book_subscription_event_type
        CHECK (event_type IN ('SUBSCRIBED', 'UNSUBSCRIBED'))
);

CREATE INDEX idx_novel_book_subscription_event_book_occurred
    ON novel_book_subscription_event(book_id, occurred_at, user_id, id);
CREATE INDEX idx_novel_book_subscription_event_reader_occurred
    ON novel_book_subscription_event(user_id, occurred_at, id);

-- Bookshelf is still the current favorite state.  Its old delete-on-unfavorite behavior lost
-- history, so all later mutations write this immutable log.  Existing rows can only provide a
-- conservative FAVORITED snapshot at their original add time; prior removals are unknowable.
CREATE TABLE novel_reader_favorite_event (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    event_type VARCHAR(32) NOT NULL,
    occurred_at TIMESTAMP NOT NULL,
    CONSTRAINT fk_novel_reader_favorite_event_book
        FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT ck_novel_reader_favorite_event_type
        CHECK (event_type IN ('FAVORITED', 'UNFAVORITED'))
);

CREATE INDEX idx_novel_reader_favorite_event_book_occurred
    ON novel_reader_favorite_event(book_id, occurred_at, user_id, id);
CREATE INDEX idx_novel_reader_favorite_event_reader_occurred
    ON novel_reader_favorite_event(user_id, occurred_at, id);

INSERT INTO novel_reader_favorite_event(user_id, book_id, event_type, occurred_at)
SELECT user_id, book_id, 'FAVORITED', added_at
FROM novel_reader_bookshelf;

-- The existing activity index starts with user_id and is ideal for per-reader retention.  Author
-- report windows filter by work and date, so add the complementary access path.
CREATE INDEX idx_novel_reader_activity_event_book_date_user
    ON novel_reader_activity_event(book_id, activity_date, user_id, id);
