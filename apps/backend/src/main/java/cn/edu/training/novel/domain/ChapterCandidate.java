package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * Immutable-in-intent replacement content for an unpublished chapter or an already public
 * chapter. The source chapter remains the reader-facing version until this candidate is approved.
 */
public record ChapterCandidate(
        long id,
        long bookId,
        long targetChapterId,
        Long volumeId,
        ChapterCandidateType type,
        String title,
        String content,
        int orderNo,
        ChapterCandidateStatus status,
        String reviewReason,
        Long moderationAuditId,
        long createdByUserId,
        Instant createdAt,
        Long reviewedByUserId,
        Instant reviewedAt) {
}
