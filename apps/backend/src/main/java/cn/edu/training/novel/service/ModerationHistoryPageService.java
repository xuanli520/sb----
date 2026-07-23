package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.BookModerationSnapshot;
import cn.edu.training.novel.domain.BookModerationSnapshotPage;
import cn.edu.training.novel.domain.BookModerationSnapshotStatus;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ContentModerationAuditPage;
import cn.edu.training.novel.domain.ContentModerationReview;
import cn.edu.training.novel.domain.ContentModerationReviewPage;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.domain.ModerationReviewDecision;
import cn.edu.training.novel.domain.ModerationTrigger;
import cn.edu.training.novel.domain.PageMeta;
import cn.edu.training.novel.mapper.ModerationHistoryPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read boundary for growing automated and human moderation evidence. */
@Service
@Transactional(readOnly = true)
public class ModerationHistoryPageService {
    public static final int MAX_PAGE_SIZE = 100;
    private final ModerationHistoryPageMapper mapper;

    public ModerationHistoryPageService(ModerationHistoryPageMapper mapper) {
        this.mapper = mapper;
    }

    public ContentModerationAuditPage audits(String contentType, int page, int size) {
        IPage<ModerationHistoryPageMapper.AuditRow> result = mapper.selectAuditPage(request(page, size), normalizeContentType(contentType));
        return new ContentModerationAuditPage(result.getRecords().stream().map(ModerationHistoryPageService::audit).toList(), meta(result, page, size));
    }

    public ContentModerationReviewPage reviews(long bookId, int page, int size) {
        requireBookId(bookId);
        IPage<ModerationHistoryPageMapper.ReviewRow> result = mapper.selectReviewPage(request(page, size), bookId);
        return new ContentModerationReviewPage(result.getRecords().stream().map(ModerationHistoryPageService::review).toList(), meta(result, page, size));
    }

    public BookModerationSnapshotPage snapshots(long bookId, int page, int size) {
        requireBookId(bookId);
        IPage<ModerationHistoryPageMapper.SnapshotRow> result = mapper.selectSnapshotPage(request(page, size), bookId);
        return new BookModerationSnapshotPage(result.getRecords().stream().map(ModerationHistoryPageService::snapshot).toList(), meta(result, page, size));
    }

    private static ContentModerationAudit audit(ModerationHistoryPageMapper.AuditRow row) {
        return new ContentModerationAudit(row.getId(), row.getContentType(), row.getContentId(), row.getContentVersionHash(),
                ModerationTrigger.valueOf(row.getTrigger()), row.getProvider(), row.getModel(), ModerationDecision.valueOf(row.getDecision()),
                row.getReason(), row.getPolicyVersion(), row.getPromptVersion(), row.getInputCharacters(), row.getRequestId(),
                row.getRawResponse(), row.getErrorSummary(), row.isSimulated(), row.getStartedAt().toInstant(), row.getCompletedAt().toInstant());
    }

    private static ContentModerationReview review(ModerationHistoryPageMapper.ReviewRow row) {
        return new ContentModerationReview(row.getId(), row.getBookId(), row.getModerationAuditId(), row.getReviewerUserId(),
                ModerationReviewDecision.valueOf(row.getDecision()), row.getReason(), row.getReviewedAt().toInstant());
    }

    private static BookModerationSnapshot snapshot(ModerationHistoryPageMapper.SnapshotRow row) {
        return new BookModerationSnapshot(row.getId(), row.getBookId(), row.getContentVersionHash(),
                BookModerationSnapshotStatus.valueOf(row.getStatus()),
                row.getAggregateDecision() == null ? null : ModerationDecision.valueOf(row.getAggregateDecision()),
                row.getAggregateReason(), row.getTotalChunks(), row.getCompletedChunks(), row.isCurrentSnapshot(),
                row.getCreatedAt().toInstant(), row.getCompletedAt() == null ? null : row.getCompletedAt().toInstant());
    }

    private static <T> Page<T> request(int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be non-negative");
        if (size < 1 || size > MAX_PAGE_SIZE) throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        return new Page<>(Math.addExact(page, 1L), size, true);
    }

    private static PageMeta meta(IPage<?> result, int page, int size) {
        return new PageMeta(result.getTotal(), page, size);
    }

    private static String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) return null;
        String value = contentType.trim();
        if (value.length() > 32) throw new IllegalArgumentException("content type must be at most 32 characters");
        return value.toUpperCase(Locale.ROOT);
    }

    private static void requireBookId(long bookId) {
        if (bookId <= 0) throw new IllegalArgumentException("book id is required");
    }
}
