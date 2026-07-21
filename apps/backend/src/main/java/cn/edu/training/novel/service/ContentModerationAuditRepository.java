package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.domain.ModerationTrigger;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/** Append-only durable audit trail for local and model moderation decisions. */
@Repository
public class ContentModerationAuditRepository {
    private static final String COLUMNS = "id, content_type, content_id, content_version_hash, audit_trigger, provider, "
            + "model_name, decision, reason, policy_version, prompt_version, input_characters, request_id, "
            + "raw_response, error_summary, simulated, started_at, completed_at";

    private static final RowMapper<ContentModerationAudit> MAPPER = (resultSet, rowNumber) -> new ContentModerationAudit(
            resultSet.getLong("id"),
            resultSet.getString("content_type"),
            resultSet.getLong("content_id"),
            resultSet.getString("content_version_hash"),
            ModerationTrigger.valueOf(resultSet.getString("audit_trigger")),
            resultSet.getString("provider"),
            resultSet.getString("model_name"),
            ModerationDecision.valueOf(resultSet.getString("decision")),
            resultSet.getString("reason"),
            resultSet.getString("policy_version"),
            resultSet.getString("prompt_version"),
            resultSet.getInt("input_characters"),
            resultSet.getString("request_id"),
            resultSet.getString("raw_response"),
            resultSet.getString("error_summary"),
            resultSet.getBoolean("simulated"),
            instant(resultSet.getTimestamp("started_at")),
            instant(resultSet.getTimestamp("completed_at")));

    private final JdbcTemplate jdbc;

    public ContentModerationAuditRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public ContentModerationAudit save(ContentModerationAudit audit) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_content_moderation_audit("
                            + "content_type, content_id, content_version_hash, audit_trigger, provider, model_name, decision, "
                            + "reason, policy_version, prompt_version, input_characters, request_id, raw_response, "
                            + "error_summary, simulated, started_at, completed_at) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setString(1, audit.contentType());
            statement.setLong(2, audit.contentId());
            statement.setString(3, audit.contentVersionHash());
            statement.setString(4, audit.trigger().name());
            statement.setString(5, audit.provider());
            statement.setString(6, audit.model());
            statement.setString(7, audit.decision().name());
            statement.setString(8, audit.reason());
            statement.setString(9, audit.policyVersion());
            statement.setString(10, audit.promptVersion());
            statement.setInt(11, audit.inputCharacters());
            statement.setString(12, audit.requestId());
            statement.setString(13, audit.rawResponse());
            statement.setString(14, audit.errorSummary());
            statement.setBoolean(15, audit.simulated());
            statement.setTimestamp(16, Timestamp.from(audit.startedAt()));
            statement.setTimestamp(17, Timestamp.from(audit.completedAt()));
            return statement;
        }, keyHolder);
        return findById(generatedId(keyHolder)).orElseThrow(() -> new IllegalStateException("moderation audit was not created"));
    }

    public List<ContentModerationAudit> findRecent(String contentType, int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 200));
        if (contentType == null || contentType.isBlank()) {
            return jdbc.query(
                    "SELECT " + COLUMNS + " FROM novel_content_moderation_audit "
                            + "ORDER BY started_at DESC, id DESC LIMIT ?",
                    MAPPER,
                    boundedLimit);
        }
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM novel_content_moderation_audit WHERE content_type = ? "
                        + "ORDER BY started_at DESC, id DESC LIMIT ?",
                MAPPER,
                contentType.trim().toUpperCase(java.util.Locale.ROOT),
                boundedLimit);
    }

    /**
     * Finds every moderation attempt whose chapter id and canonical content version both match
     * the version currently locked for a human reviewer. Earlier attempts for an edited chapter
     * are intentionally absent from this result.
     */
    public List<ContentModerationAudit> findCurrentChapterAudits(Map<Long, String> chapterVersions) {
        if (chapterVersions == null || chapterVersions.isEmpty()) {
            return List.of();
        }
        StringBuilder predicates = new StringBuilder();
        java.util.ArrayList<Object> parameters = new java.util.ArrayList<>();
        parameters.add("CHAPTER");
        for (Map.Entry<Long, String> entry : chapterVersions.entrySet()) {
            if (predicates.length() > 0) {
                predicates.append(" OR ");
            }
            predicates.append("(content_id = ? AND content_version_hash = ?)");
            parameters.add(entry.getKey());
            parameters.add(entry.getValue());
        }
        return jdbc.query(
                "SELECT " + COLUMNS + " FROM novel_content_moderation_audit WHERE content_type = ? AND ("
                        + predicates + ") ORDER BY started_at ASC, id ASC",
                MAPPER,
                parameters.toArray());
    }

    private java.util.Optional<ContentModerationAudit> findById(long id) {
        return jdbc.query(
                        "SELECT " + COLUMNS + " FROM novel_content_moderation_audit WHERE id = ?",
                        MAPPER,
                        id)
                .stream()
                .findFirst();
    }

    private static long generatedId(KeyHolder keyHolder) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a moderation audit id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric moderation audit id");
        }
        return number.longValue();
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp.toInstant();
    }
}
