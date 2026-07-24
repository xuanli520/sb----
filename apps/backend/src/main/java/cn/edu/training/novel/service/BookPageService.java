package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookPresentationPage;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.BookStatusAudit;
import cn.edu.training.novel.domain.BookStatusAuditPage;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterCandidateType;
import cn.edu.training.novel.domain.LegacyReviewTriageAction;
import cn.edu.training.novel.domain.LegacyReviewTriageAudit;
import cn.edu.training.novel.domain.LegacyReviewTriageAuditPage;
import cn.edu.training.novel.domain.ModerationReviewQueueItem;
import cn.edu.training.novel.domain.ModerationReviewQueuePage;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.domain.PageMeta;
import cn.edu.training.novel.mapper.BookPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Owns book-list page boundaries. MyBatis-Plus adds the database pagination and count queries;
 * presentation metrics are projected in one batched read for the records in that page.
 */
@Service
@Transactional(readOnly = true)
public class BookPageService {
    public static final int MAX_PAGE_SIZE = 48;

    private final BookPageMapper mapper;
    private final BookPresentationService presentationService;

    public BookPageService(BookPageMapper mapper, BookPresentationService presentationService) {
        this.mapper = mapper;
        this.presentationService = presentationService;
    }

    public BookPresentationPage bookshelf(long userId, int page, int size) {
        return present(mapper.selectBookshelfPage(request(page, size), userId), page, size);
    }

    public boolean bookshelfContains(long userId, long bookId) {
        if (bookId <= 0) {
            throw new IllegalArgumentException("book id is required");
        }
        return mapper.existsBookshelfBook(userId, bookId);
    }

    public BookPresentationPage authorBooks(long authorId, int page, int size) {
        return present(mapper.selectAuthorBooksPage(request(page, size), authorId), page, size);
    }

    public BookPresentationPage wholeBookReviews(int page, int size) {
        return present(mapper.selectWholeBookReviewsPage(request(page, size)), page, size);
    }

    /** Isolated recovery list for records written by the retired whole-book NEEDS_REVIEW flow. */
    public BookPresentationPage legacyReviewTriage(int page, int size) {
        return present(mapper.selectLegacyNeedsReviewPage(request(page, size)), page, size);
    }

    public BookPresentationPage availabilityManagedBooks(int page, int size) {
        return present(mapper.selectAvailabilityManagedPage(request(page, size)), page, size);
    }

    public BookPresentationPage carouselEligibleBooks(String query, int page, int size) {
        String normalizedQuery = query == null || query.isBlank() ? null : query.trim();
        return present(mapper.selectCarouselEligibleBooksPage(request(page, size), normalizedQuery), page, size);
    }

    public BookStatusAuditPage statusAudits(long bookId, int page, int size) {
        if (bookId <= 0) {
            throw new IllegalArgumentException("book id is required");
        }
        IPage<BookPageMapper.BookStatusAuditRow> result = mapper.selectBookStatusAuditPage(requestAudit(page, size), bookId);
        return new BookStatusAuditPage(
                result.getRecords().stream().map(BookPageService::toStatusAudit).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    public LegacyReviewTriageAuditPage legacyReviewTriageAudits(long bookId, int page, int size) {
        if (bookId <= 0) {
            throw new IllegalArgumentException("book id is required");
        }
        IPage<BookPageMapper.BookStatusAuditRow> result = mapper.selectLegacyReviewTriageAuditPage(
                requestAudit(page, size), bookId);
        return new LegacyReviewTriageAuditPage(
                result.getRecords().stream().map(BookPageService::toLegacyReviewTriageAudit).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    public ModerationReviewQueuePage moderationQueue(ModerationReviewScope scope, int page, int size) {
        IPage<BookPageMapper.ModerationQueueRow> result = mapper.selectModerationQueuePage(
                requestQueue(page, size),
                scope == null ? null : scope.name());
        return new ModerationReviewQueuePage(
                result.getRecords().stream().map(BookPageService::toModerationQueueItem).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    private BookPresentationPage present(IPage<Book> result, int page, int size) {
        return new BookPresentationPage(
                presentationService.present(result.getRecords()),
                new PageMeta(result.getTotal(), page, size));
    }

    private static BookStatusAudit toStatusAudit(BookPageMapper.BookStatusAuditRow row) {
        return new BookStatusAudit(
                row.getId(),
                row.getBookId(),
                row.getAction(),
                BookStatus.valueOf(row.getPreviousStatus()),
                BookStatus.valueOf(row.getStatus()),
                row.getReason(),
                row.getOperatorUserId(),
                row.getCreatedAt().toInstant());
    }

    private static LegacyReviewTriageAudit toLegacyReviewTriageAudit(BookPageMapper.BookStatusAuditRow row) {
        return new LegacyReviewTriageAudit(
                row.getId(),
                row.getBookId(),
                LegacyReviewTriageAction.valueOf(row.getAction()),
                BookStatus.valueOf(row.getPreviousStatus()),
                BookStatus.valueOf(row.getStatus()),
                row.getReason(),
                row.getOperatorUserId(),
                row.getCreatedAt().toInstant());
    }

    private static ModerationReviewQueueItem toModerationQueueItem(BookPageMapper.ModerationQueueRow row) {
        Book book = new Book(
                row.getBookId(),
                row.getBookTitle(),
                row.getBookAuthor(),
                row.getBookCategory(),
                row.getBookWords(),
                row.getBookSerialStatus(),
                row.getBookSynopsis(),
                // Operational queue rows must not revive a legacy raw cover value. Public-facing
                // callers resolve the active media binding through BookPresentationService.
                null,
                BookStatus.valueOf(row.getBookStatus()),
                row.getBookAuthorId(),
                row.getBookHeat(),
                row.getBookPurchasePrice());
        if (row.getCandidateId() == null) {
            return new ModerationReviewQueueItem(ModerationReviewScope.WHOLE_BOOK, book, null);
        }
        ChapterCandidate candidate = new ChapterCandidate(
                row.getCandidateId(),
                row.getBookId(),
                row.getCandidateTargetChapterId(),
                row.getCandidateVolumeId(),
                ChapterCandidateType.valueOf(row.getCandidateType()),
                row.getCandidateTitle(),
                row.getCandidateContent(),
                row.getCandidateOrderNo(),
                ChapterCandidateStatus.valueOf(row.getCandidateStatus()),
                row.getCandidateReviewReason(),
                row.getCandidateModerationAuditId(),
                row.getCandidateCreatedByUserId(),
                row.getCandidateCreatedAt().toInstant(),
                row.getCandidateReviewedByUserId(),
                row.getCandidateReviewedAt() == null ? null : row.getCandidateReviewedAt().toInstant());
        return new ModerationReviewQueueItem(
                ModerationReviewScope.valueOf(row.getScope()),
                book,
                candidate);
    }

    private static Page<Book> request(int page, int size) {
        validatePage(page, size);
        return new Page<>(Math.addExact(page, 1L), size, true);
    }

    private static Page<BookPageMapper.BookStatusAuditRow> requestAudit(int page, int size) {
        validatePage(page, size);
        return new Page<>(Math.addExact(page, 1L), size, true);
    }

    private static Page<BookPageMapper.ModerationQueueRow> requestQueue(int page, int size) {
        validatePage(page, size);
        return new Page<>(Math.addExact(page, 1L), size, true);
    }

    private static void validatePage(int page, int size) {
        if (page < 0) {
            throw new IllegalArgumentException("page must be non-negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        }
    }
}
