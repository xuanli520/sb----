package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Bookmark;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.BookSubscription;
import cn.edu.training.novel.domain.ReadingPreference;
import cn.edu.training.novel.domain.ReadingProgress;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Durable, user-scoped reader state. Every read takes a user id, and every mutation persists that
 * owner id with the row so one reader cannot observe or overwrite another reader's state.
 */
@Repository
public class ReaderRepository {
    private static final int DAILY_CHECKIN_AWARD = 10;
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    private static final RowMapper<ReadingPreference> PREFERENCE_MAPPER = (resultSet, rowNumber) -> new ReadingPreference(
            resultSet.getString("theme"),
            resultSet.getString("font_family"),
            resultSet.getInt("font_size"),
            resultSet.getInt("line_height"),
            resultSet.getInt("brightness"),
            resultSet.getString("page_mode"));
    private static final RowMapper<ReadingProgress> PROGRESS_MAPPER = (resultSet, rowNumber) -> new ReadingProgress(
            resultSet.getLong("book_id"),
            resultSet.getLong("chapter_id"),
            resultSet.getInt("character_offset"),
            instant(resultSet.getTimestamp("updated_at")));
    private static final RowMapper<Bookmark> BOOKMARK_MAPPER = (resultSet, rowNumber) -> new Bookmark(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getLong("chapter_id"),
            resultSet.getInt("character_offset"),
            resultSet.getString("note"),
            instant(resultSet.getTimestamp("created_at")));
    private final JdbcTemplate jdbc;

    public ReaderRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Deletes an existing shelf row first; a successful insert is the durable "saved" state.
     * The primary key keeps retries and concurrent adds from creating duplicate shelf entries.
     */
    @Transactional
    public boolean toggleShelf(long userId, long bookId) {
        if (jdbc.update(
                "DELETE FROM novel_reader_bookshelf WHERE user_id = ? AND book_id = ?",
                userId,
                bookId) == 1) {
            recordFavoriteEvent(userId, bookId, "UNFAVORITED");
            return false;
        }
        try {
            int inserted = jdbc.update(
                    "INSERT INTO novel_reader_bookshelf(user_id, book_id, added_at) "
                            + "SELECT ?, id, CURRENT_TIMESTAMP FROM novel_book WHERE id = ? AND status = ?",
                    userId,
                    bookId,
                    BookStatus.PUBLISHED.name());
            if (inserted != 1) {
                throw new java.util.NoSuchElementException("book not published");
            }
            recordFavoriteEvent(userId, bookId, "FAVORITED");
            return true;
        } catch (DuplicateKeyException exception) {
            // A concurrent toggle inserted the same row after our DELETE. Applying this toggle
            // removes that durable row, which preserves two sequential toggle operations.
            int removed = jdbc.update(
                    "DELETE FROM novel_reader_bookshelf WHERE user_id = ? AND book_id = ?",
                    userId,
                    bookId);
            if (removed == 1) {
                recordFavoriteEvent(userId, bookId, "UNFAVORITED");
            }
            return false;
        }
    }

    /**
     * A subscription is an idempotent, free reader-follow operation. The current-state primary
     * key is the idempotency boundary; only a state transition creates an immutable event.
     */
    @Transactional
    public BookSubscription subscribe(long userId, long bookId) {
        try {
            int inserted = jdbc.update(
                    "INSERT INTO novel_book_subscription(user_id, book_id, subscribed_at) "
                            + "SELECT ?, id, CURRENT_TIMESTAMP FROM novel_book WHERE id = ? AND status = ?",
                    userId,
                    bookId,
                    BookStatus.PUBLISHED.name());
            if (inserted != 1) {
                throw new java.util.NoSuchElementException("book not published");
            }
            recordSubscriptionEvent(userId, bookId, "SUBSCRIBED");
        } catch (DuplicateKeyException ignored) {
            // The existing state is the successful result of a retried or concurrent subscribe.
        }
        return subscriptionFor(userId, bookId)
                .orElseThrow(() -> new IllegalStateException("book subscription was not saved"));
    }

    /** Removing an absent subscription is intentionally idempotent and never emits a fake event. */
    @Transactional
    public BookSubscription unsubscribe(long userId, long bookId) {
        if (jdbc.update(
                "DELETE FROM novel_book_subscription WHERE user_id = ? AND book_id = ?",
                userId,
                bookId) == 1) {
            recordSubscriptionEvent(userId, bookId, "UNSUBSCRIBED");
        }
        return new BookSubscription(bookId, false, null);
    }

    public List<BookSubscription> subscriptions(long userId) {
        return jdbc.query(
                "SELECT subscription.book_id, subscription.subscribed_at "
                        + "FROM novel_book_subscription subscription "
                        + "JOIN novel_book book ON book.id = subscription.book_id "
                        + "WHERE subscription.user_id = ? AND book.status = ? "
                        + "ORDER BY subscription.subscribed_at DESC, subscription.book_id ASC",
                (resultSet, rowNumber) -> new BookSubscription(
                        resultSet.getLong("book_id"), true, instant(resultSet.getTimestamp("subscribed_at"))),
                userId,
                BookStatus.PUBLISHED.name());
    }

    public BookSubscription subscription(long userId, long bookId) {
        return subscriptionFor(userId, bookId)
                .orElseGet(() -> new BookSubscription(bookId, false, null));
    }

    public Set<Long> shelf(long userId) {
        List<Long> books = jdbc.query(
                "SELECT shelf.book_id FROM novel_reader_bookshelf shelf "
                        + "JOIN novel_book book ON book.id = shelf.book_id "
                        + "WHERE shelf.user_id = ? AND book.status = ? ORDER BY shelf.added_at DESC, shelf.book_id ASC",
                (resultSet, rowNumber) -> resultSet.getLong(1),
                userId,
                BookStatus.PUBLISHED.name());
        return Collections.unmodifiableSet(new LinkedHashSet<>(books));
    }

    /**
     * The check-in insert is the idempotency boundary: the (user, date) primary key prevents a
     * second award even when the request is retried. Its transaction also rolls back the insert if
     * the balance write cannot complete.
     */
    @Transactional
    public int checkin(long userId) {
        // Reader-facing daily benefits follow the same Shanghai business day used by reports.
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        try {
            jdbc.update(
                    "INSERT INTO novel_reader_daily_checkin(user_id, checkin_date, awarded_points, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                    userId,
                    Date.valueOf(today),
                    DAILY_CHECKIN_AWARD);
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException("already checked in today");
        }

        jdbc.update(
                "INSERT INTO novel_reader_point_balance(user_id, points, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) "
                        + "ON DUPLICATE KEY UPDATE points = points + VALUES(points), updated_at = CURRENT_TIMESTAMP",
                userId,
                DAILY_CHECKIN_AWARD);
        return pointBalance(userId);
    }

    public int pointBalance(long userId) {
        List<Long> balances = jdbc.query(
                "SELECT points FROM novel_reader_point_balance WHERE user_id = ?",
                (resultSet, rowNumber) -> resultSet.getLong(1),
                userId);
        return balances.isEmpty() ? 0 : asApiAmount(balances.getFirst());
    }

    public Optional<ReadingPreference> preference(long userId) {
        List<ReadingPreference> preferences = jdbc.query(
                "SELECT theme, font_family, font_size, line_height, brightness, page_mode "
                        + "FROM novel_reader_preference WHERE user_id = ?",
                PREFERENCE_MAPPER,
                userId);
        return preferences.stream().findFirst();
    }

    @Transactional
    public ReadingPreference savePreference(long userId, ReadingPreference preference) {
        jdbc.update(
                "INSERT INTO novel_reader_preference(user_id, theme, font_family, font_size, line_height, brightness, page_mode, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) "
                        + "ON DUPLICATE KEY UPDATE theme = VALUES(theme), font_family = VALUES(font_family), "
                        + "font_size = VALUES(font_size), line_height = VALUES(line_height), brightness = VALUES(brightness), "
                        + "page_mode = VALUES(page_mode), updated_at = CURRENT_TIMESTAMP",
                userId,
                preference.theme(),
                preference.font(),
                preference.fontSize(),
                preference.lineHeight(),
                preference.brightness(),
                preference.pageMode());
        return preference(userId).orElseThrow(() -> new IllegalStateException("reading preference was not saved"));
    }

    @Transactional
    public ReadingProgress saveProgress(long userId, long bookId, long chapterId, int offset) {
        Instant occurredAt = Instant.now();
        jdbc.update(
                "INSERT INTO novel_reader_progress(user_id, book_id, chapter_id, character_offset, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?) "
                        + "ON DUPLICATE KEY UPDATE chapter_id = VALUES(chapter_id), "
                        + "character_offset = VALUES(character_offset), updated_at = CURRENT_TIMESTAMP",
                userId,
                bookId,
                chapterId,
                offset,
                Timestamp.from(occurredAt));
        recordReadingActivity(userId, bookId, chapterId, occurredAt);
        return progressForBook(userId, bookId)
                .orElseThrow(() -> new IllegalStateException("reading progress was not saved"));
    }

    /**
     * Retention needs durable return evidence, rather than the overwrite-only progress state.
     * The unique key intentionally bounds this to one immutable event per reader/work/Shanghai
     * day; repeated progress saves never inflate a cohort's active-reader count.
     */
    private void recordReadingActivity(long userId, long bookId, long chapterId, Instant occurredAt) {
        try {
            jdbc.update(
                    "INSERT INTO novel_reader_activity_event(user_id, book_id, chapter_id, event_type, activity_date, occurred_at) "
                            + "VALUES (?, ?, ?, 'READING_PROGRESS', ?, ?)",
                    userId,
                    bookId,
                    chapterId,
                    Date.valueOf(occurredAt.atZone(BUSINESS_ZONE).toLocalDate()),
                    Timestamp.from(occurredAt));
        } catch (DuplicateKeyException ignored) {
            // A second save on the same book/day is expected and leaves the prior immutable event
            // untouched. MySQL and H2 both permit the surrounding transaction to continue.
        }
    }

    private void recordFavoriteEvent(long userId, long bookId, String eventType) {
        jdbc.update(
                "INSERT INTO novel_reader_favorite_event(user_id, book_id, event_type, occurred_at) "
                        + "VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                userId,
                bookId,
                eventType);
    }

    private void recordSubscriptionEvent(long userId, long bookId, String eventType) {
        jdbc.update(
                "INSERT INTO novel_book_subscription_event(user_id, book_id, event_type, occurred_at) "
                        + "VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                userId,
                bookId,
                eventType);
    }

    public List<ReadingProgress> progress(long userId) {
        return jdbc.query(
                "SELECT book_id, chapter_id, character_offset, updated_at FROM novel_reader_progress "
                        + "WHERE user_id = ? ORDER BY updated_at DESC, book_id ASC",
                PROGRESS_MAPPER,
                userId);
    }

    public Optional<ReadingProgress> progressForBook(long userId, long bookId) {
        List<ReadingProgress> values = jdbc.query(
                "SELECT book_id, chapter_id, character_offset, updated_at FROM novel_reader_progress "
                        + "WHERE user_id = ? AND book_id = ?",
                PROGRESS_MAPPER,
                userId,
                bookId);
        return values.stream().findFirst();
    }

    private Optional<BookSubscription> subscriptionFor(long userId, long bookId) {
        List<BookSubscription> values = jdbc.query(
                "SELECT book_id, subscribed_at FROM novel_book_subscription WHERE user_id = ? AND book_id = ?",
                (resultSet, rowNumber) -> new BookSubscription(
                        resultSet.getLong("book_id"), true, instant(resultSet.getTimestamp("subscribed_at"))),
                userId,
                bookId);
        return values.stream().findFirst();
    }

    @Transactional
    public Bookmark createBookmark(long userId, long bookId, long chapterId, int offset, String note) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_reader_bookmark(user_id, book_id, chapter_id, character_offset, note, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, userId);
            statement.setLong(2, bookId);
            statement.setLong(3, chapterId);
            statement.setInt(4, offset);
            statement.setString(5, note);
            return statement;
        }, keyHolder);
        long id = generatedId(keyHolder);
        return bookmarkByIdForUser(id, userId)
                .orElseThrow(() -> new IllegalStateException("bookmark was not saved"));
    }

    /** The owner predicate is intentionally present even for a just-inserted bookmark. */
    public Optional<Bookmark> bookmarkByIdForUser(long bookmarkId, long userId) {
        List<Bookmark> values = jdbc.query(
                "SELECT id, book_id, chapter_id, character_offset, note, created_at FROM novel_reader_bookmark "
                        + "WHERE id = ? AND user_id = ?",
                BOOKMARK_MAPPER,
                bookmarkId,
                userId);
        return values.stream().findFirst();
    }

    public List<Bookmark> bookmarks(long userId, long bookId) {
        return jdbc.query(
                "SELECT id, book_id, chapter_id, character_offset, note, created_at FROM novel_reader_bookmark "
                        + "WHERE user_id = ? AND book_id = ? ORDER BY created_at ASC, id ASC",
                BOOKMARK_MAPPER,
                userId,
                bookId);
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp.toInstant();
    }

    private static int asApiAmount(long amount) {
        try {
            return Math.toIntExact(amount);
        } catch (ArithmeticException exception) {
            throw new IllegalStateException("points balance exceeds API range", exception);
        }
    }

    private static long generatedId(KeyHolder keyHolder) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a generated bookmark id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric bookmark id");
        }
        return number.longValue();
    }
}
