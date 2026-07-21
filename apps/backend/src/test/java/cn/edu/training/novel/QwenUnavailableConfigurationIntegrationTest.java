package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.config.QwenModerationModelHandle;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.service.NovelStore;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.annotation.DirtiesContext;

/**
 * A missing Qwen credential must retain the normal audit and review workflow rather than making
 * the application unavailable. A missing handle also proves this context creates no remote client.
 */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.runtime-mode=TEST",
        "novel.audit.qwen.enabled=true",
        "novel.audit.qwen.base-url=https://workspace.example.test/compatible-mode/v1",
        "novel.audit.qwen.model=qwen-test-only",
        "spring.ai.openai.chat.api-key=",
        "novel.audit.moderation.development-simulation-enabled=false",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:qwen_unavailable_configuration_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class QwenUnavailableConfigurationIntegrationTest {
    @Autowired ApplicationContext context;
    @Autowired NovelStore store;
    @Autowired @Qualifier("qwenModerationModelHandle") QwenModerationModelHandle qwenModerationModelHandle;

    @Test
    void missingCredentialStartsAndFailsClosedWithoutAModelCall() {
        assertThat(qwenModerationModelHandle.model()).isEmpty();
        assertThat(qwenModerationModelHandle.unavailableReason()).contains("API credential");
        assertThat(context.getBeansOfType(ChatModel.class)).isEmpty();

        Chapter held = store.addChapter(2L, 1L, "配置异常", "配置错误时依然必须留存审核记录。", true);
        ContentModerationAudit audit = store.moderationAudits("CHAPTER", 20).stream()
                .filter(item -> item.contentId() == held.id())
                .findFirst()
                .orElseThrow();

        assertThat(held.status()).isEqualTo(ChapterStatus.NEEDS_REVIEW);
        assertThat(audit.decision()).isEqualTo(ModerationDecision.MODEL_UNAVAILABLE);
        assertThat(audit.reason()).contains("API credential");
    }
}
