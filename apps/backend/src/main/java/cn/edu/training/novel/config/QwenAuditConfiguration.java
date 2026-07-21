package cn.edu.training.novel.config;

import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties({
        QwenAuditProperties.class,
        ContentModerationProperties.class,
        FullBookModerationProperties.class,
        NovelRuntimeProperties.class
})
public class QwenAuditConfiguration {
    private static final Logger LOGGER = LoggerFactory.getLogger(QwenAuditConfiguration.class);

    /**
     * A dedicated Qwen capability keeps the audit path opt-in even if other Spring AI integrations
     * are added later. Invalid or incomplete operator settings deliberately create an unavailable
     * capability rather than preventing audit persistence and fail-closed content lifecycle logic.
     */
    @Bean("qwenModerationModelHandle")
    QwenModerationModelHandle qwenModerationModelHandle(
            QwenAuditProperties qwen,
            @Value("${spring.ai.openai.chat.api-key:}") String apiKey) {
        if (!qwen.enabled()) {
            return QwenModerationModelHandle.unavailable(
                    "Qwen moderation is not explicitly enabled; automatic publication is withheld.");
        }
        var endpoint = qwen.compatibleBaseUrl();
        if (endpoint.isEmpty()) {
            LOGGER.warn("Qwen moderation is enabled but its configured base URL is missing or invalid.");
            return QwenModerationModelHandle.unavailable(
                    "Qwen moderation is enabled but its base URL is missing or invalid; automatic publication is withheld.");
        }
        if (!qwen.hasModel()) {
            LOGGER.warn("Qwen moderation is enabled but its configured model is missing.");
            return QwenModerationModelHandle.unavailable(
                    "Qwen moderation is enabled but its model is missing; automatic publication is withheld.");
        }
        if (apiKey == null || apiKey.isBlank()) {
            LOGGER.warn("Qwen moderation is enabled but its API credential is missing.");
            return QwenModerationModelHandle.unavailable(
                    "Qwen moderation is enabled but its API credential is missing; automatic publication is withheld.");
        }

        // Do not request tools or structured-output extensions that the target Qwen compatibility
        // endpoint may not support. Output is strictly validated by QwenContentModelModerationClient.
        try {
            OpenAiChatOptions options = OpenAiChatOptions.builder()
                    .baseUrl(endpoint.orElseThrow().toString())
                    .apiKey(apiKey)
                    .model(qwen.model().trim())
                    .temperature(0.0)
                    .maxTokens(512)
                    .timeout(qwen.timeout())
                    .maxRetries(0)
                    .build();
            return QwenModerationModelHandle.available(OpenAiChatModel.builder().options(options).build());
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Qwen moderation model could not be created from its configuration ({}).",
                    exception.getClass().getSimpleName());
            return QwenModerationModelHandle.unavailable(
                    "Qwen moderation configuration could not create a compatible model client; automatic publication is withheld.");
        }
    }
}
