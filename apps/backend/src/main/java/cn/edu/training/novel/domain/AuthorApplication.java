package cn.edu.training.novel.domain;

import java.time.Instant;

public record AuthorApplication(
        long id,
        long userId,
        String penName,
        String statement,
        String status,
        String reason,
        Instant createdAt,
        Instant decidedAt,
        Long decidedByUserId,
        Instant reapplyAvailableAt) {

    /** Compatibility constructor for callers that do not yet expose an approval timestamp. */
    public AuthorApplication(
            long id,
            long userId,
            String penName,
            String statement,
            String status,
            String reason,
            Instant createdAt) {
        this(id, userId, penName, statement, status, reason, createdAt, null, null, null);
    }

    /** Compatibility constructor for callers that only expose the decision timestamp. */
    public AuthorApplication(
            long id,
            long userId,
            String penName,
            String statement,
            String status,
            String reason,
            Instant createdAt,
            Instant decidedAt) {
        this(id, userId, penName, statement, status, reason, createdAt, decidedAt, null, null);
    }
}
