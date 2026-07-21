package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * Operator-safe state of an immutable whole-work moderation snapshot.
 *
 * <p>The copied work text lives only in the internal chunk table and is intentionally absent from
 * this projection so it cannot reach browser-facing APIs by accident.
 */
public record BookModerationSnapshot(
        long id,
        long bookId,
        String contentVersionHash,
        BookModerationSnapshotStatus status,
        ModerationDecision aggregateDecision,
        String aggregateReason,
        int totalChunks,
        int completedChunks,
        boolean current,
        Instant createdAt,
        Instant completedAt) {
}
