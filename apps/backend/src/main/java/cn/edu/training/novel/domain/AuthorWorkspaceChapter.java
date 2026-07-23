package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * A paged chapter row for the author workspace. The optional candidate is the latest review
 * outcome that still needs author attention, so the editor never needs a second unbounded list
 * query.
 */
public record AuthorWorkspaceChapter(
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
        String volumeTitle,
        Integer volumeOrderNo,
        ChapterCandidate latestCandidate) {}
