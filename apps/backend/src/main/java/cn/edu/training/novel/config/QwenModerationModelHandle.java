package cn.edu.training.novel.config;

import java.util.Objects;
import java.util.Optional;
import org.springframework.ai.chat.model.ChatModel;

/**
 * A dedicated Qwen model capability. An unavailable handle lets the application start and retain
 * moderation evidence even when operator configuration is incomplete.
 */
public record QwenModerationModelHandle(Optional<ChatModel> model, String unavailableReason) {
    private static final String DEFAULT_UNAVAILABLE_REASON =
            "Qwen moderation model is unavailable; automatic publication is withheld.";

    public QwenModerationModelHandle {
        model = model == null ? Optional.empty() : model;
        unavailableReason = model.isPresent()
                ? null
                : (unavailableReason == null || unavailableReason.isBlank()
                        ? DEFAULT_UNAVAILABLE_REASON
                        : unavailableReason);
    }

    public static QwenModerationModelHandle available(ChatModel model) {
        return new QwenModerationModelHandle(Optional.of(Objects.requireNonNull(model, "model")), null);
    }

    public static QwenModerationModelHandle unavailable(String reason) {
        return new QwenModerationModelHandle(Optional.empty(), reason);
    }

    public boolean isAvailable() {
        return model.isPresent();
    }
}
