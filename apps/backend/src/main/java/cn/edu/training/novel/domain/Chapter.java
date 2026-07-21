package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * The legacy {@code published} flag remains part of the public contract. The explicit state and
 * schedule fields make the lifecycle observable without allowing a scheduled chapter to be read.
 */
public record Chapter(
        long id,
        long bookId,
        Long volumeId,
        String title,
        String content,
        boolean published,
        ChapterStatus status,
        Instant scheduledPublishAt,
        Instant publishedAt,
        String reviewReason,
        int orderNo) {

    public Chapter(long id, long bookId, String title, String content, boolean published, int orderNo) {
        this(
                id,
                bookId,
                null,
                title,
                content,
                published,
                published ? ChapterStatus.PUBLISHED : ChapterStatus.DRAFT,
                null,
                published ? Instant.now() : null,
                "",
                orderNo);
    }
}
