package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * Reader-facing chapter projection.  A restricted chapter deliberately has a {@code null}
 * content value while keeping its catalog metadata visible for the reading directory.
 */
public record ReaderChapter(
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
        int orderNo,
        boolean readable,
        String access) {}
