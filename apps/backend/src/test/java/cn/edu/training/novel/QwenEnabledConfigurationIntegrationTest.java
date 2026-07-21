package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.config.QwenModerationModelHandle;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;

/** Instantiation uses a fake key and never calls the provider; it only validates the opt-in wiring. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.audit.qwen.enabled=true",
        "novel.audit.qwen.base-url=https://workspace.example.test/compatible-mode/v1",
        "novel.audit.qwen.model=qwen-test-only",
        "spring.ai.openai.chat.api-key=test-only-not-a-real-key",
        "spring.datasource.url=jdbc:h2:mem:qwen_enabled_configuration_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
class QwenEnabledConfigurationIntegrationTest {
    @Autowired @Qualifier("qwenModerationModelHandle") QwenModerationModelHandle qwenModerationModelHandle;

    @Test
    void explicitQwenConfigurationCreatesOnlyTheDedicatedSpringAiChatModelHandle() {
        assertThat(qwenModerationModelHandle.model()).isPresent();
        assertThat(qwenModerationModelHandle.unavailableReason()).isNull();
    }
}
