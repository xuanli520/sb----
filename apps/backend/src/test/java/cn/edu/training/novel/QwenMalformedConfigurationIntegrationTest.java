package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.config.QwenModerationModelHandle;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

/** Invalid non-secret operator fields must not make the fail-closed moderation workflow unavailable. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.audit.qwen.enabled=true",
        "novel.audit.qwen.base-url=this is not a valid Qwen endpoint",
        "novel.audit.qwen.model=",
        "spring.ai.openai.chat.api-key=test-only-not-a-real-key",
        "spring.datasource.url=jdbc:h2:mem:qwen_malformed_configuration_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
class QwenMalformedConfigurationIntegrationTest {
    @Autowired ApplicationContext context;
    @Autowired @Qualifier("qwenModerationModelHandle") QwenModerationModelHandle qwenModerationModelHandle;

    @Test
    void malformedEndpointAndBlankModelProduceAnUnavailableHandleWithoutCreatingAChatModel() {
        assertThat(qwenModerationModelHandle.model()).isEmpty();
        assertThat(qwenModerationModelHandle.unavailableReason()).contains("base URL");
        assertThat(context.getBeansOfType(ChatModel.class)).isEmpty();
    }
}
