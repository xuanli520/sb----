package cn.edu.training.novel.domain;

import java.time.Instant;

/**
 * Safe operator-facing projection of a moderation attempt. It stores a version hash instead of
 * the submitted text and contains only bounded, sanitised provider diagnostics.
 */
public record ContentModerationAudit(
        long id,
        String contentType,
        long contentId,
        String contentVersionHash,
        ModerationTrigger trigger,
        String provider,
        String model,
        ModerationDecision decision,
        String reason,
        String policyVersion,
        String promptVersion,
        int inputCharacters,
        String requestId,
        String rawResponse,
        String errorSummary,
        boolean simulated,
        Instant startedAt,
        Instant completedAt) {
}
