package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * A deliberately redacted administrator timeline event. It identifies the action and resource,
 * but never returns reader-created text, redemption codes, token balances, or session data.
 */
public record AdminUserBehaviorEvent(
        String eventType,
        Instant occurredAt,
        Long bookId,
        String bookTitle,
        Long chapterId,
        String chapterTitle,
        String status) {}
