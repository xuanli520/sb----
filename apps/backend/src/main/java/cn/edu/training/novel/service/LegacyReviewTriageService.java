package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.LegacyReviewTriageAction;
import java.util.List;
import java.util.NoSuchElementException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Manually drains records stranded in the retired whole-book NEEDS_REVIEW state. This is the
 * only write path that still recognizes that status; normal chapter and review flows do not.
 */
@Service
public class LegacyReviewTriageService {
    private static final int MAX_REASON_LENGTH = 900;

    private final CatalogRepository catalogRepository;
    private final BookModerationSnapshotService snapshotService;
    private final LegacyReviewTriageRepository auditRepository;
    private final AuditTrail auditTrail;

    public LegacyReviewTriageService(
            CatalogRepository catalogRepository,
            BookModerationSnapshotService snapshotService,
            LegacyReviewTriageRepository auditRepository,
            AuditTrail auditTrail) {
        this.catalogRepository = catalogRepository;
        this.snapshotService = snapshotService;
        this.auditRepository = auditRepository;
        this.auditTrail = auditTrail;
    }

    @Transactional
    public Book decide(long operatorUserId, long bookId, LegacyReviewTriageAction action, String reason) {
        if (operatorUserId <= 0) {
            throw new IllegalArgumentException("operator user id is required");
        }
        if (bookId <= 0) {
            throw new IllegalArgumentException("book id is required");
        }
        if (action == null) {
            throw new IllegalArgumentException("triage action is required");
        }
        String normalizedReason = normalizeReason(reason);
        Book existing = catalogRepository.findByIdForUpdate(bookId)
                .orElseThrow(() -> new NoSuchElementException("book not found"));
        if (existing.status() != BookStatus.NEEDS_REVIEW) {
            throw new IllegalStateException("book is not awaiting legacy review triage");
        }

        BookStatus targetStatus = action == LegacyReviewTriageAction.REQUEUE_FOR_REVIEW
                ? BookStatus.PENDING_REVIEW
                : BookStatus.REJECTED;
        Book updated = withStatus(existing, targetStatus);
        catalogRepository.updateBook(updated);

        if (action == LegacyReviewTriageAction.REQUEUE_FOR_REVIEW) {
            List<Chapter> chapters = catalogRepository.findChaptersByBookIdForUpdate(existing.id());
            snapshotService.queueCurrentSnapshot(updated, chapters);
        }
        auditRepository.record(
                existing.id(), action, existing.status(), targetStatus, normalizedReason, operatorUserId);
        auditTrail.record("legacy-review-triage operator=" + operatorUserId
                + " book=" + existing.id() + " action=" + action.name());
        return updated;
    }

    private static Book withStatus(Book book, BookStatus status) {
        return new Book(
                book.id(),
                book.title(),
                book.author(),
                book.category(),
                book.words(),
                book.serialStatus(),
                book.synopsis(),
                null,
                status,
                book.authorId(),
                book.heat(),
                book.purchasePrice());
    }

    private static String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("triage reason is required");
        }
        String normalized = reason.trim();
        if (normalized.length() > MAX_REASON_LENGTH) {
            throw new IllegalArgumentException("triage reason is too long");
        }
        return normalized;
    }
}
