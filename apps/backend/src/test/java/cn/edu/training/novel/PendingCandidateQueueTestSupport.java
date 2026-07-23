package cn.edu.training.novel;

import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ModerationReviewScope;
import cn.edu.training.novel.service.BookPageService;
import cn.edu.training.novel.service.NovelStore;
import java.util.Objects;

/** Test-only lookup through the same scoped review queue used by administrator workflows. */
final class PendingCandidateQueueTestSupport {
    private static final int QUEUE_PAGE_SIZE = BookPageService.MAX_PAGE_SIZE;

    private PendingCandidateQueueTestSupport() { }

    static ChapterCandidate pendingCandidate(
            NovelStore store, ModerationReviewScope scope, long targetChapterId) {
        return store.reviewQueue(scope, 0, QUEUE_PAGE_SIZE).items().stream()
                .map(item -> item.candidate())
                .filter(Objects::nonNull)
                .filter(candidate -> candidate.targetChapterId() == targetChapterId)
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "pending " + scope + " candidate not found for chapter " + targetChapterId));
    }
}
