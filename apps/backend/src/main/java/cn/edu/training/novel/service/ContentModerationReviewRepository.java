package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.ContentModerationReview;
import cn.edu.training.novel.domain.ModerationReviewDecision;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/** Persistence boundary for immutable human-review evidence. No update or delete operation exists. */
@Repository
public class ContentModerationReviewRepository {
    private static final String COLUMNS = "id, book_id, moderation_audit_id, reviewer_user_id, decision, reason, reviewed_at";

    private static final RowMapper<ContentModerationReview> MAPPER = (resultSet, rowNumber) -> new ContentModerationReview(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getLong("moderation_audit_id"),
            resultSet.getLong("reviewer_user_id"),
            ModerationReviewDecision.valueOf(resultSet.getString("decision")),
            resultSet.getString("reason"),
            instant(resultSet.getTimestamp("reviewed_at")));

    private final JdbcTemplate jdbc;

    public ContentModerationReviewRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ContentModerationReview> appendAll(List<ContentModerationReview> reviews) {
        return reviews.stream().map(this::append).toList();
    }

    public List<ContentModerationReview> findByBookId(long bookId, int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 200));
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM novel_content_moderation_review WHERE book_id = ? "
                        + "ORDER BY reviewed_at DESC, id DESC LIMIT ?",
                MAPPER,
                bookId,
                boundedLimit);
    }

    private ContentModerationReview append(ContentModerationReview review) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_content_moderation_review("
                            + "book_id, moderation_audit_id, reviewer_user_id, decision, reason, reviewed_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, review.bookId());
            statement.setLong(2, review.moderationAuditId());
            statement.setLong(3, review.reviewerUserId());
            statement.setString(4, review.decision().name());
            statement.setString(5, review.reason());
            statement.setTimestamp(6, Timestamp.from(review.reviewedAt()));
            return statement;
        }, keyHolder);
        return findById(generatedId(keyHolder))
                .orElseThrow(() -> new IllegalStateException("moderation review was not created"));
    }

    private Optional<ContentModerationReview> findById(long id) {
        return jdbc.query(
                        "SELECT " + COLUMNS + " FROM novel_content_moderation_review WHERE id = ?",
                        MAPPER,
                        id)
                .stream()
                .findFirst();
    }

    private static long generatedId(KeyHolder keyHolder) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a moderation review id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric moderation review id");
        }
        return number.longValue();
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp.toInstant();
    }
}
