package cn.edu.training.novel.domain;

/** Operator queue projection. Exactly one of {@code book} or {@code candidate} is actionable. */
public record ModerationReviewQueueItem(
        ModerationReviewScope scope,
        Book book,
        ChapterCandidate candidate) {
}
