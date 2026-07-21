package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AuthorApplication;
import cn.edu.training.novel.domain.AuthorProfile;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
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

/** Durable operations data for author approval, content vocabulary and dashboard counts. */
@Repository
public class OperationsRepository {
    private static final String PENDING = "PENDING";
    private static final String AUTHOR_APPLICATION_COLUMNS =
            "id, user_id, pen_name, statement, status, decision_reason, created_at, decided_at, decided_by_user_id";
    private static final RowMapper<AuthorApplication> AUTHOR_APPLICATION_MAPPER = (resultSet, rowNumber) -> new AuthorApplication(
            resultSet.getLong("id"),
            resultSet.getLong("user_id"),
            resultSet.getString("pen_name"),
            resultSet.getString("statement"),
            resultSet.getString("status"),
            resultSet.getString("decision_reason"),
            instant(resultSet.getTimestamp("created_at")),
            nullableInstant(resultSet.getTimestamp("decided_at")),
            resultSet.getObject("decided_by_user_id", Long.class));
    private static final RowMapper<AuthorProfile> AUTHOR_PROFILE_MAPPER = (resultSet, rowNumber) -> new AuthorProfile(
            resultSet.getLong("user_id"),
            resultSet.getString("pen_name"),
            resultSet.getLong("approved_application_id"),
            instant(resultSet.getTimestamp("approved_at")));

    private final JdbcTemplate jdbc;

    public OperationsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public AuthorApplication createAuthorApplication(long userId, String penName, String statement) {
        try {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statementHandle = connection.prepareStatement(
                        "INSERT INTO novel_author_application(user_id, pending_user_id, pen_name, statement, status, decision_reason, created_at, updated_at) "
                                + "VALUES (?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                        Statement.RETURN_GENERATED_KEYS);
                statementHandle.setLong(1, userId);
                statementHandle.setLong(2, userId);
                statementHandle.setString(3, penName);
                statementHandle.setString(4, statement);
                statementHandle.setString(5, PENDING);
                return statementHandle;
            }, keyHolder);
            return findAuthorApplication(generatedId(keyHolder, "author application"))
                    .orElseThrow(() -> new IllegalStateException("author application was not created"));
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException("an author application is already pending");
        }
    }

    public List<AuthorApplication> findPendingAuthorApplications() {
        return jdbc.query(
                "SELECT " + AUTHOR_APPLICATION_COLUMNS + " "
                        + "FROM novel_author_application WHERE status = ? ORDER BY created_at ASC, id ASC",
                AUTHOR_APPLICATION_MAPPER,
                PENDING);
    }

    /** Returns the state a reader should see in their account center, including past decisions. */
    public Optional<AuthorApplication> findLatestAuthorApplicationForUser(long userId) {
        List<AuthorApplication> applications = jdbc.query(
                "SELECT " + AUTHOR_APPLICATION_COLUMNS + " "
                        + "FROM novel_author_application WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
                AUTHOR_APPLICATION_MAPPER,
                userId);
        return applications.stream().findFirst();
    }

    public Optional<AuthorApplication> findAuthorApplication(long applicationId) {
        List<AuthorApplication> applications = jdbc.query(
                "SELECT " + AUTHOR_APPLICATION_COLUMNS + " "
                        + "FROM novel_author_application WHERE id = ?",
                AUTHOR_APPLICATION_MAPPER,
                applicationId);
        return applications.stream().findFirst();
    }

    public Optional<AuthorApplication> lockAuthorApplication(long applicationId) {
        List<AuthorApplication> applications = jdbc.query(
                "SELECT " + AUTHOR_APPLICATION_COLUMNS + " "
                        + "FROM novel_author_application WHERE id = ? FOR UPDATE",
                AUTHOR_APPLICATION_MAPPER,
                applicationId);
        return applications.stream().findFirst();
    }

    /**
     * Locks the application rows before the profile row, matching approval's lock order. In
     * particular, this prevents an applicant from observing an old profile snapshot while an
     * administrator is converting their pending application into an approved profile.
     */
    public List<AuthorApplication> lockAuthorApplicationsForUser(long userId) {
        return jdbc.query(
                "SELECT " + AUTHOR_APPLICATION_COLUMNS + " FROM novel_author_application "
                        + "WHERE user_id = ? ORDER BY created_at ASC, id ASC FOR UPDATE",
                AUTHOR_APPLICATION_MAPPER,
                userId);
    }

    public AuthorApplication decideAuthorApplication(long applicationId, long reviewerUserId, boolean approve, String reason) {
        if (reviewerUserId <= 0) {
            throw new IllegalArgumentException("reviewer user id is required");
        }
        AuthorApplication application = lockAuthorApplication(applicationId)
                .orElseThrow(() -> new java.util.NoSuchElementException("author application not found"));
        if (!PENDING.equals(application.status())) {
            throw new IllegalStateException("author application is not pending");
        }
        if (approve && findAuthorProfileForUpdate(application.userId()).isPresent()) {
            throw new IllegalStateException("an approved author profile already exists");
        }
        String status = approve ? "APPROVED" : "REJECTED";
        int changed = jdbc.update(
                "UPDATE novel_author_application SET pending_user_id = NULL, status = ?, decision_reason = ?, "
                        + "decided_by_user_id = ?, decided_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND status = ?",
                status,
                reason == null ? "" : reason,
                reviewerUserId,
                applicationId,
                PENDING);
        if (changed != 1) {
            throw new IllegalStateException("author application decision was not applied");
        }
        return findAuthorApplication(applicationId)
                .orElseThrow(() -> new IllegalStateException("author application decision was not saved"));
    }

    /**
     * The caller holds the application-decision transaction. Keeping this insert in that transaction
     * means an approved application can never grant AUTHOR without also having a persisted pen name.
     */
    public AuthorProfile createAuthorProfile(AuthorApplication approvedApplication) {
        if (!"APPROVED".equals(approvedApplication.status())) {
            throw new IllegalArgumentException("only approved author applications can create profiles");
        }
        jdbc.update(
                "INSERT INTO novel_author_profile(user_id, pen_name, approved_application_id, approved_at, created_at, updated_at) "
                        + "VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                approvedApplication.userId(),
                approvedApplication.penName(),
                approvedApplication.id());
        return findAuthorProfile(approvedApplication.userId())
                .orElseThrow(() -> new IllegalStateException("author profile was not created"));
    }

    public Optional<AuthorProfile> findAuthorProfile(long userId) {
        List<AuthorProfile> profiles = jdbc.query(
                "SELECT user_id, pen_name, approved_application_id, approved_at FROM novel_author_profile WHERE user_id = ?",
                AUTHOR_PROFILE_MAPPER,
                userId);
        return profiles.stream().findFirst();
    }

    /** A locking current read is required after application locks under MySQL REPEATABLE_READ. */
    public Optional<AuthorProfile> findAuthorProfileForUpdate(long userId) {
        List<AuthorProfile> profiles = jdbc.query(
                "SELECT user_id, pen_name, approved_application_id, approved_at "
                        + "FROM novel_author_profile WHERE user_id = ? FOR UPDATE",
                AUTHOR_PROFILE_MAPPER,
                userId);
        return profiles.stream().findFirst();
    }

    public Set<String> sensitiveWords() {
        List<String> words = jdbc.query(
                "SELECT word FROM novel_sensitive_word ORDER BY normalized_word ASC",
                (resultSet, rowNumber) -> resultSet.getString(1));
        return Set.copyOf(new LinkedHashSet<>(words));
    }

    /** Idempotently inserts a word so repeated operations do not create duplicate vocabulary rows. */
    public String addSensitiveWord(String word) {
        String displayWord = requireWord(word);
        String normalizedWord = normalizeWord(displayWord);
        try {
            jdbc.update(
                    "INSERT INTO novel_sensitive_word(normalized_word, word, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    normalizedWord,
                    displayWord);
        } catch (DuplicateKeyException exception) {
            jdbc.update(
                    "UPDATE novel_sensitive_word SET word = ?, updated_at = CURRENT_TIMESTAMP WHERE normalized_word = ?",
                    displayWord,
                    normalizedWord);
        }
        return displayWord;
    }

    /** Uses the persisted vocabulary at decision time; there is deliberately no JVM cache. */
    public boolean containsSensitiveWord(String value) {
        if (value == null || value.isEmpty()) return false;
        return jdbc.query(
                        "SELECT word FROM novel_sensitive_word ORDER BY normalized_word ASC",
                        (resultSet, rowNumber) -> resultSet.getString(1))
                .stream()
                .anyMatch(value::contains);
    }

    public long countEnabledReaders() {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE enabled = TRUE AND roles LIKE ?",
                Long.class,
                "%READER%");
        return count == null ? 0L : count;
    }

    /** A read is a persisted reading-position update during the database's current calendar day. */
    public long countTodayReads() {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_reader_progress WHERE updated_at >= CURRENT_DATE",
                Long.class);
        return count == null ? 0L : count;
    }

    private static String requireWord(String word) {
        if (word == null || word.isBlank()) throw new IllegalArgumentException("sensitive word is required");
        String trimmed = word.trim();
        if (trimmed.length() > 128) throw new IllegalArgumentException("sensitive word is too long");
        return trimmed;
    }

    private static String normalizeWord(String value) {
        // Retain the prior in-memory Set<String> matching behavior: words are exact substrings.
        return value;
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp.toInstant();
    }

    private static Instant nullableInstant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static long generatedId(KeyHolder keyHolder, String label) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a generated " + label + " id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric " + label + " id");
        }
        return number.longValue();
    }
}
