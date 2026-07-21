package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.ModerationDecision;
import java.time.Instant;

/**
 * Result from the model boundary. The service still controls persistence and lifecycle decisions;
 * this object never carries a command to publish a work.
 */
public record ModelModerationResult(
        ModerationDecision decision,
        String provider,
        String model,
        String reason,
        String rawResponse,
        String errorSummary,
        boolean simulated,
        String requestId,
        Instant startedAt,
        Instant completedAt) {

    public static ModelModerationResult unavailable(
            String provider, String model, String reason, String requestId, Instant startedAt) {
        return new ModelModerationResult(
                ModerationDecision.MODEL_UNAVAILABLE,
                provider,
                model,
                reason,
                null,
                reason,
                false,
                requestId,
                startedAt,
                Instant.now());
    }

    public static ModelModerationResult error(
            String provider, String model, String reason, String errorSummary, String requestId, Instant startedAt) {
        return new ModelModerationResult(
                ModerationDecision.MODEL_ERROR,
                provider,
                model,
                reason,
                null,
                errorSummary,
                false,
                requestId,
                startedAt,
                Instant.now());
    }

    public static ModelModerationResult invalidOutput(
            String provider, String model, String reason, String rawResponse, String requestId, Instant startedAt) {
        return new ModelModerationResult(
                ModerationDecision.INVALID_OUTPUT,
                provider,
                model,
                reason,
                rawResponse,
                reason,
                false,
                requestId,
                startedAt,
                Instant.now());
    }
}
