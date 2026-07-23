package cn.edu.training.novel.domain;

/** A separately scoped media-review item, intentionally distinct from text moderation evidence. */
public record BookCoverCandidateQueueItem(
        String scope,
        Book book,
        BookCoverCandidate candidate) {
    public static final String SCOPE = "BOOK_COVER";
}
