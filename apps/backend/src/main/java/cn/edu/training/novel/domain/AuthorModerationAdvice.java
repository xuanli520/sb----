package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * An author-owned recommendation for a pending reader interaction. It is deliberately advisory:
 * only a station administrator may make the final visibility decision.
 */
public record AuthorModerationAdvice(String recommendation, String reason, Instant updatedAt) {}
