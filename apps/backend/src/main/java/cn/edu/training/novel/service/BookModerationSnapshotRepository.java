package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.BookModerationSnapshot;
import cn.edu.training.novel.domain.BookModerationSnapshotStatus;
import cn.edu.training.novel.domain.ModerationDecision;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * Durable queue for immutable whole-work moderation data. Chunk text is private to this package;
 * only {@link BookModerationSnapshot} is safe for an operator-facing controller.
 */
@Repository
public class BookModerationSnapshotRepository {
    private static final String SNAPSHOT_COLUMNS = "id, book_id, content_version_hash, status, aggregate_decision, "
            + "aggregate_reason, total_chunks, completed_chunks, current_snapshot, created_at, completed_at";

    private static final RowMapper<BookModerationSnapshot> SNAPSHOT_MAPPER = (resultSet, rowNumber) -> {
        String aggregateDecision = resultSet.getString("aggregate_decision");
        return new BookModerationSnapshot(
                resultSet.getLong("id"),
                resultSet.getLong("book_id"),
                resultSet.getString("content_version_hash"),
                BookModerationSnapshotStatus.valueOf(resultSet.getString("status")),
                aggregateDecision == null ? null : ModerationDecision.valueOf(aggregateDecision),
                resultSet.getString("aggregate_reason"),
                resultSet.getInt("total_chunks"),
                resultSet.getInt("completed_chunks"),
                resultSet.getBoolean("current_snapshot"),
                instant(resultSet.getTimestamp("created_at")),
                instant(resultSet.getTimestamp("completed_at")));
    };

    private final JdbcTemplate jdbc;

    public BookModerationSnapshotRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Caller must hold the parent book lock before replacing its current snapshot. */
    public void supersedeCurrentSnapshots(long bookId) {
        jdbc.update(
                "UPDATE novel_book_moderation_snapshot "
                        + "SET current_snapshot = ?, status = CASE WHEN status IN (?, ?) THEN ? ELSE status END "
                        + "WHERE book_id = ? AND current_snapshot = ?",
                false,
                BookModerationSnapshotStatus.QUEUED.name(),
                BookModerationSnapshotStatus.PROCESSING.name(),
                BookModerationSnapshotStatus.STALE.name(),
                bookId,
                true);
    }

    public SnapshotCreation create(
            long bookId,
            String contentVersionHash,
            String bookTitle,
            String bookSynopsis,
            List<SnapshotChunkDraft> chunks) {
        if (chunks == null || chunks.isEmpty()) {
            throw new IllegalArgumentException("a whole-work snapshot must contain at least one chunk");
        }
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_book_moderation_snapshot("
                            + "book_id, content_version_hash, book_title, book_synopsis, status, aggregate_decision, "
                            + "aggregate_reason, total_chunks, completed_chunks, current_snapshot, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 0, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, bookId);
            statement.setString(2, contentVersionHash);
            statement.setString(3, bookTitle);
            statement.setString(4, bookSynopsis);
            statement.setString(5, BookModerationSnapshotStatus.QUEUED.name());
            statement.setInt(6, chunks.size());
            statement.setBoolean(7, true);
            return statement;
        }, keyHolder);
        long snapshotId = generatedId(keyHolder, "snapshot");

        List<SnapshotChunk> createdChunks = new ArrayList<>(chunks.size());
        for (SnapshotChunkDraft draft : chunks) {
            KeyHolder chunkKeys = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO novel_book_moderation_snapshot_chunk("
                                + "snapshot_id, source_chapter_id, chunk_sequence, chunk_title, chunk_content, "
                                + "content_version_hash, input_characters, status, attempt_count, created_at) "
                                + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setLong(1, snapshotId);
                if (draft.sourceChapterId() == null) {
                    statement.setObject(2, null);
                } else {
                    statement.setLong(2, draft.sourceChapterId());
                }
                statement.setInt(3, draft.sequence());
                statement.setString(4, draft.title());
                statement.setString(5, draft.content());
                statement.setString(6, draft.contentVersionHash());
                statement.setInt(7, draft.inputCharacters());
                statement.setString(8, BookModerationSnapshotChunkStatus.QUEUED.name());
                return statement;
            }, chunkKeys);
            createdChunks.add(new SnapshotChunk(generatedId(chunkKeys, "snapshot chunk"), draft));
        }
        return new SnapshotCreation(
                findById(snapshotId).orElseThrow(() -> new IllegalStateException("snapshot was not created")),
                List.copyOf(createdChunks));
    }

    public Optional<BookModerationSnapshot> findCurrentByBookId(long bookId) {
        return jdbc.query(
                        "SELECT " + SNAPSHOT_COLUMNS + " FROM novel_book_moderation_snapshot "
                                + "WHERE book_id = ? AND current_snapshot = ? ORDER BY id DESC LIMIT 1",
                        SNAPSHOT_MAPPER,
                        bookId,
                        true)
                .stream()
                .findFirst();
    }

    /** Locks the safe parent state after a caller has locked the book and its live chapters. */
    public Optional<BookModerationSnapshot> findCurrentByBookIdForUpdate(long bookId) {
        return jdbc.query(
                        "SELECT " + SNAPSHOT_COLUMNS + " FROM novel_book_moderation_snapshot "
                                + "WHERE book_id = ? AND current_snapshot = ? ORDER BY id DESC LIMIT 1 FOR UPDATE",
                        SNAPSHOT_MAPPER,
                        bookId,
                        true)
                .stream()
                .findFirst();
    }

    public List<BookModerationSnapshot> findByBookId(long bookId, int limit) {
        int boundedLimit = Math.max(1, Math.min(limit, 100));
        return jdbc.query(
                "SELECT " + SNAPSHOT_COLUMNS + " FROM novel_book_moderation_snapshot "
                        + "WHERE book_id = ? ORDER BY id DESC LIMIT ?",
                SNAPSHOT_MAPPER,
                bookId,
                boundedLimit);
    }

    /**
     * Claims exactly one eligible chunk in a short transaction. The caller must commit before
     * making a provider call; a lease lets a later worker recover from a crashed process.
     */
    public Optional<BookModerationChunkClaim> claimNext(Instant now, Duration lease) {
        List<BookModerationChunkClaim> candidates = jdbc.query(
                "SELECT s.id AS snapshot_id, s.book_id AS snapshot_book_id, s.content_version_hash AS snapshot_hash, "
                        + "c.id AS chunk_id, c.chunk_title AS chunk_title, c.chunk_content AS chunk_content, "
                        + "c.content_version_hash AS chunk_hash "
                        + "FROM novel_book_moderation_snapshot_chunk c "
                        + "JOIN novel_book_moderation_snapshot s ON s.id = c.snapshot_id "
                        + "WHERE s.current_snapshot = ? AND s.status IN (?, ?) "
                        + "AND (c.status = ? OR (c.status = ? AND c.lease_expires_at <= ?)) "
                        + "ORDER BY s.created_at ASC, s.id ASC, c.chunk_sequence ASC, c.id ASC LIMIT 1 FOR UPDATE",
                (resultSet, rowNumber) -> new BookModerationChunkClaim(
                        resultSet.getLong("snapshot_id"),
                        resultSet.getLong("snapshot_book_id"),
                        resultSet.getString("snapshot_hash"),
                        resultSet.getLong("chunk_id"),
                        resultSet.getString("chunk_title"),
                        resultSet.getString("chunk_content"),
                        resultSet.getString("chunk_hash"),
                        UUID.randomUUID().toString()),
                true,
                BookModerationSnapshotStatus.QUEUED.name(),
                BookModerationSnapshotStatus.PROCESSING.name(),
                BookModerationSnapshotChunkStatus.QUEUED.name(),
                BookModerationSnapshotChunkStatus.PROCESSING.name(),
                Timestamp.from(now));
        if (candidates.isEmpty()) {
            return Optional.empty();
        }
        BookModerationChunkClaim claim = candidates.getFirst();
        Instant leaseExpiresAt = now.plus(lease);
        int updated = jdbc.update(
                "UPDATE novel_book_moderation_snapshot_chunk "
                        + "SET status = ?, claim_token = ?, claimed_at = ?, lease_expires_at = ?, "
                        + "attempt_count = attempt_count + 1 WHERE id = ?",
                BookModerationSnapshotChunkStatus.PROCESSING.name(),
                claim.claimToken(),
                Timestamp.from(now),
                Timestamp.from(leaseExpiresAt),
                claim.chunkId());
        if (updated != 1) {
            throw new IllegalStateException("snapshot chunk claim was lost before it could be recorded");
        }
        jdbc.update(
                "UPDATE novel_book_moderation_snapshot SET status = ? WHERE id = ? AND status = ?",
                BookModerationSnapshotStatus.PROCESSING.name(),
                claim.snapshotId(),
                BookModerationSnapshotStatus.QUEUED.name());
        return Optional.of(claim);
    }

    /**
     * Locks the parent snapshot and chunk before an evaluated audit is persisted. A stale lease
     * result therefore cannot attach audit evidence or change a newer snapshot's outcome.
     */
    public boolean lockActiveClaim(BookModerationChunkClaim claim) {
        Optional<BookModerationSnapshot> snapshot = findByIdForUpdate(claim.snapshotId());
        if (snapshot.isEmpty()
                || !snapshot.get().current()
                || snapshot.get().status() == BookModerationSnapshotStatus.STALE) {
            return false;
        }
        Integer matches = jdbc.query(
                        "SELECT id FROM novel_book_moderation_snapshot_chunk "
                                + "WHERE id = ? AND snapshot_id = ? AND status = ? AND claim_token = ? FOR UPDATE",
                        (resultSet, rowNumber) -> resultSet.getInt("id"),
                        claim.chunkId(),
                        claim.snapshotId(),
                        BookModerationSnapshotChunkStatus.PROCESSING.name(),
                        claim.claimToken())
                .stream()
                .findFirst()
                .orElse(null);
        return matches != null;
    }

    /** Must be called after {@link #lockActiveClaim(BookModerationChunkClaim)} in the same transaction. */
    public void completeLockedClaim(BookModerationChunkClaim claim, long auditId, Instant completedAt) {
        int updated = jdbc.update(
                "UPDATE novel_book_moderation_snapshot_chunk "
                        + "SET status = ?, moderation_audit_id = ?, completed_at = ?, lease_expires_at = NULL "
                        + "WHERE id = ? AND snapshot_id = ? AND status = ? AND claim_token = ?",
                BookModerationSnapshotChunkStatus.COMPLETED.name(),
                auditId,
                Timestamp.from(completedAt),
                claim.chunkId(),
                claim.snapshotId(),
                BookModerationSnapshotChunkStatus.PROCESSING.name(),
                claim.claimToken());
        if (updated != 1) {
            throw new IllegalStateException("snapshot chunk completion lost its active claim");
        }
        jdbc.update(
                "UPDATE novel_book_moderation_snapshot SET completed_chunks = completed_chunks + 1 WHERE id = ?",
                claim.snapshotId());
    }

    /** Completes a synthetic bound-failure chunk created as part of the same snapshot transaction. */
    public void completeUnclaimedChunk(long snapshotId, long chunkId, long auditId, Instant completedAt) {
        int updated = jdbc.update(
                "UPDATE novel_book_moderation_snapshot_chunk "
                        + "SET status = ?, moderation_audit_id = ?, completed_at = ? "
                        + "WHERE id = ? AND snapshot_id = ? AND status = ?",
                BookModerationSnapshotChunkStatus.COMPLETED.name(),
                auditId,
                Timestamp.from(completedAt),
                chunkId,
                snapshotId,
                BookModerationSnapshotChunkStatus.QUEUED.name());
        if (updated != 1) {
            throw new IllegalStateException("snapshot boundary chunk could not be completed");
        }
        jdbc.update(
                "UPDATE novel_book_moderation_snapshot SET completed_chunks = completed_chunks + 1 WHERE id = ?",
                snapshotId);
    }

    public boolean allChunksCompleted(long snapshotId) {
        Integer remaining = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_book_moderation_snapshot_chunk WHERE snapshot_id = ? AND status <> ?",
                Integer.class,
                snapshotId,
                BookModerationSnapshotChunkStatus.COMPLETED.name());
        return remaining != null && remaining == 0;
    }

    public List<ModerationDecision> completedDecisions(long snapshotId) {
        return jdbc.query(
                "SELECT a.decision FROM novel_book_moderation_snapshot_chunk c "
                        + "JOIN novel_content_moderation_audit a ON a.id = c.moderation_audit_id "
                        + "WHERE c.snapshot_id = ? ORDER BY c.chunk_sequence ASC, c.id ASC",
                (resultSet, rowNumber) -> ModerationDecision.valueOf(resultSet.getString("decision")),
                snapshotId);
    }

    public void completeSnapshot(
            long snapshotId, ModerationDecision aggregateDecision, String aggregateReason, Instant completedAt) {
        int updated = jdbc.update(
                "UPDATE novel_book_moderation_snapshot SET status = ?, aggregate_decision = ?, aggregate_reason = ?, "
                        + "completed_at = ? WHERE id = ? AND current_snapshot = ? AND status <> ?",
                BookModerationSnapshotStatus.COMPLETED.name(),
                aggregateDecision.name(),
                aggregateReason,
                Timestamp.from(completedAt),
                snapshotId,
                true,
                BookModerationSnapshotStatus.STALE.name());
        if (updated != 1) {
            throw new IllegalStateException("current snapshot could not be finalized");
        }
    }

    public List<Long> completedAuditIds(long snapshotId) {
        return jdbc.query(
                "SELECT moderation_audit_id FROM novel_book_moderation_snapshot_chunk "
                        + "WHERE snapshot_id = ? AND status = ? AND moderation_audit_id IS NOT NULL "
                        + "ORDER BY chunk_sequence ASC, id ASC",
                (resultSet, rowNumber) -> resultSet.getLong("moderation_audit_id"),
                snapshotId,
                BookModerationSnapshotChunkStatus.COMPLETED.name());
    }

    private Optional<BookModerationSnapshot> findById(long snapshotId) {
        return jdbc.query(
                        "SELECT " + SNAPSHOT_COLUMNS + " FROM novel_book_moderation_snapshot WHERE id = ?",
                        SNAPSHOT_MAPPER,
                        snapshotId)
                .stream()
                .findFirst();
    }

    private Optional<BookModerationSnapshot> findByIdForUpdate(long snapshotId) {
        return jdbc.query(
                        "SELECT " + SNAPSHOT_COLUMNS + " FROM novel_book_moderation_snapshot WHERE id = ? FOR UPDATE",
                        SNAPSHOT_MAPPER,
                        snapshotId)
                .stream()
                .findFirst();
    }

    private static long generatedId(KeyHolder keyHolder, String entity) {
        if (keyHolder.getKeyList().isEmpty()) {
            throw new IllegalStateException("database did not return a " + entity + " id");
        }
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) {
            throw new IllegalStateException("database did not return a numeric " + entity + " id");
        }
        return number.longValue();
    }

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }
}

/** Internal immutable source row used when the snapshot repository writes copied text. */
record SnapshotChunkDraft(
        int sequence,
        Long sourceChapterId,
        String title,
        String content,
        String contentVersionHash,
        int inputCharacters) {
}

/** Internal id paired with a draft; raw text never leaves the service package. */
record SnapshotChunk(long id, SnapshotChunkDraft draft) {
}

/** Result of creating a snapshot and all of its immutable copied chunks. */
record SnapshotCreation(BookModerationSnapshot snapshot, List<SnapshotChunk> chunks) {
}

/** A committed lease handed to the model caller. It contains copied, never live, content. */
record BookModerationChunkClaim(
        long snapshotId,
        long bookId,
        String snapshotContentVersionHash,
        long chunkId,
        String title,
        String content,
        String contentVersionHash,
        String claimToken) {
}

enum BookModerationSnapshotChunkStatus {
    QUEUED,
    PROCESSING,
    COMPLETED
}
