package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ContentModerationReview;
import cn.edu.training.novel.domain.ModerationReviewDecision;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Records a reviewer decision only against moderation evidence for the chapter version reviewed. */
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
        if (reviewerUserId <= 0) {
            throw new IllegalArgumentException("reviewer user id is required");
        }
        Map<Long, String> currentVersions = new LinkedHashMap<>();
        for (Chapter chapter : currentChapters) {
            currentVersions.put(
                    chapter.id(),
                    ContentModerationService.chapterContentVersionHash(chapter.title(), chapter.content()));
        }

        List<ContentModerationAudit> currentAudits = auditRepository.findCurrentChapterAudits(currentVersions);
        if (currentAudits.isEmpty()) {
            return List.of();
        }
        Instant reviewedAt = Instant.now();
        ModerationReviewDecision decision = ModerationReviewDecision.fromApproval(approved);
        List<ContentModerationReview> reviews = currentAudits.stream()
                .map(audit -> new ContentModerationReview(
                        0,
                        bookId,
                        audit.id(),
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
