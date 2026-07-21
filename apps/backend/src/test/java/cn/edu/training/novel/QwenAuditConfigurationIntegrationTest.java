package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.config.QwenAuditProperties;
import cn.edu.training.novel.config.QwenModerationModelHandle;
import com.openai.client.OpenAIClient;
import com.openai.client.OpenAIClientAsync;
import java.time.Duration;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:qwen_configuration_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
class QwenAuditConfigurationIntegrationTest {
    @Autowired ApplicationContext context;
    @Autowired QwenAuditProperties qwenAuditProperties;
    @Autowired QwenModerationModelHandle qwenModerationModelHandle;

    @Test
    void defaultDeploymentDoesNotCreateAChatModelOrBindAnApiKeyIntoAuditSettings() {
        assertThat(context.getBeansOfType(ChatModel.class)).isEmpty();
        assertThat(context.getBeansOfType(OpenAIClient.class)).isEmpty();
        assertThat(context.getBeansOfType(OpenAIClientAsync.class)).isEmpty();
        assertThat(qwenAuditProperties.enabled()).isFalse();
        assertThat(qwenAuditProperties.maxRetries()).isZero();
        assertThat(qwenAuditProperties.isConfiguredWhenEnabled()).isTrue();
        assertThat(qwenModerationModelHandle.model()).isEmpty();
        assertThat(Arrays.stream(QwenAuditProperties.class.getRecordComponents())
                .map(component -> component.getName()))
                .doesNotContain("apiKey", "api-key", "dashscopeApiKey");
    }

    @Test
    void enabledAuditRequiresAnHttpsEndpointAndConfiguredModel() {
        assertThat(new QwenAuditProperties(
                true, "https://workspace.example.test/compatible-mode/v1", "qwen-plus",
                Duration.ofSeconds(20), 0, 60).isConfiguredWhenEnabled()).isTrue();
        assertThat(new QwenAuditProperties(
                true, "http://workspace.example.test/compatible-mode/v1", "qwen-plus",
                Duration.ofSeconds(20), 0, 60).isConfiguredWhenEnabled()).isFalse();
        assertThat(new QwenAuditProperties(
                true, "https://workspace.example.test/compatible-mode/v1", " ",
                Duration.ofSeconds(20), 0, 60).isConfiguredWhenEnabled()).isFalse();
        assertThat(new QwenAuditProperties(
                true, "this is not a URI", "qwen-plus",
                Duration.ofSeconds(20), 0, 60).compatibleBaseUrl()).isEmpty();
    }
}
