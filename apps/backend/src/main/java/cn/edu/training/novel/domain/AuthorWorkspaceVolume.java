package cn.edu.training.novel.domain;

import java.time.Instant;

/** A paged author-workspace volume with its server-side chapter count. */
public record AuthorWorkspaceVolume(
        long id,
        long bookId,
        String title,
        int orderNo,
        Instant createdAt,
        long chapterCount) {}
