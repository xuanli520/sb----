package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ContentModerationReview;
import cn.edu.training.novel.domain.ModerationReviewDecision;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Records a reviewer decision only against current chapter and terminal whole-work snapshot evidence. */
@Service
public class ContentModerationReviewService {
    private final ContentModerationAuditRepository auditRepository;
    private final ContentModerationReviewRepository reviewRepository;

    public ContentModerationReviewService(
            ContentModerationAuditRepository auditRepository,
            ContentModerationReviewRepository reviewRepository) {
        this.auditRepository = auditRepository;
        this.reviewRepository = reviewRepository;
    }

    @Transactional
    public List<ContentModerationReview> recordCurrentChapterEvidence(
            long bookId,
            long reviewerUserId,
            boolean approved,
            String reason,
            List<Chapter> currentChapters) {
        return recordCurrentBookEvidence(
                bookId, reviewerUserId, approved, reason, currentChapters, List.of());
    }

    /** Appends an operator decision for the exact immutable candidate moderation attempt. */
    @Transactional
    public List<ContentModerationReview> recordCandidateEvidence(
            long bookId,
            long reviewerUserId,
            boolean approved,
            String reason,
            long moderationAuditId) {
        if (reviewerUserId <= 0) {
            throw new IllegalArgumentException("reviewer user id is required");
        }
        if (moderationAuditId <= 0) {
            throw new IllegalStateException("chapter candidate is missing moderation evidence");
        }
        return reviewRepository.appendAll(List.of(new ContentModerationReview(
                0,
                bookId,
                moderationAuditId,
                reviewerUserId,
                ModerationReviewDecision.fromApproval(approved),
                reason,
                Instant.now())));
    }

    /**
     * Appends one immutable reviewer decision for the live chapter evidence and for every chunk
     * audit belonging to the terminal whole-work snapshot. The caller obtains snapshot ids only
     * after locking and verifying that its version hash matches the current book.
     */
    @Transactional
    public List<ContentModerationReview> recordCurrentBookEvidence(
            long bookId,
            long reviewerUserId,
            boolean approved,
            String reason,
            List<Chapter> currentChapters,
            List<Long> snapshotAuditIds) {
        if (reviewerUserId <= 0) {
            throw new IllegalArgumentException("reviewer user id is required");
        }
        Map<Long, String> currentVersions = new LinkedHashMap<>();
        for (Chapter chapter : currentChapters) {
            currentVersions.put(
                    chapter.id(),
                    ContentModerationService.chapterContentVersionHash(chapter.title(), chapter.content()));
        }

        LinkedHashSet<Long> auditIds = new LinkedHashSet<>();
        auditRepository.findCurrentChapterAudits(currentVersions).stream()
                .map(ContentModerationAudit::id)
                .forEach(auditIds::add);
        if (snapshotAuditIds != null) {
            snapshotAuditIds.stream()
                    .filter(auditId -> auditId != null && auditId > 0)
                    .forEach(auditIds::add);
        }
        if (auditIds.isEmpty()) {
            return List.of();
        }
        Instant reviewedAt = Instant.now();
        ModerationReviewDecision decision = ModerationReviewDecision.fromApproval(approved);
        List<ContentModerationReview> reviews = auditIds.stream()
                .map(auditId -> new ContentModerationReview(
                        0,
                        bookId,
                        auditId,
                        reviewerUserId,
                        decision,
                        reason,
                        reviewedAt))
                .toList();
        return reviewRepository.appendAll(reviews);
    }

    public List<ContentModerationReview> recentReviews(long bookId, int limit) {
        if (bookId <= 0) {
            throw new IllegalArgumentException("book id is required");
        }
        return reviewRepository.findByBookId(bookId, limit);
    }
}
