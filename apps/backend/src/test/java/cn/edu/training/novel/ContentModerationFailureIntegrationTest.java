package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.service.ContentModelModerationClient;
import cn.edu.training.novel.service.ContentModerationRequest;
import cn.edu.training.novel.service.ModelModerationResult;
import cn.edu.training.novel.service.NovelStore;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(classes = {
        NovelPlatformApplication.class,
        ContentModerationFailureIntegrationTest.StubModerationConfiguration.class
}, properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.audit.moderation.development-simulation-enabled=false",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:content_moderation_failure_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ContentModerationFailureIntegrationTest {
    @Autowired NovelStore store;
    @Autowired StubModerationClient stub;

    @Test
    void providerFailureFailsClosedAndRedactsTheProviderDiagnostic() {
        stub.mode = StubMode.ERROR;

        Chapter held = store.addChapter(2L, 1L, "模型错误", "安全正文也必须在错误时转人工。", true);
        ContentModerationAudit audit = onlyAuditFor(held.id());

        assertThat(held.status()).isEqualTo(ChapterStatus.NEEDS_REVIEW);
        assertThat(held.published()).isFalse();
        assertThat(held.reviewReason()).contains("模型审核不可用或结果无效");
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.NEEDS_REVIEW);
        assertThat(audit.decision()).isEqualTo(ModerationDecision.MODEL_ERROR);
        assertThat(audit.errorSummary()).startsWith("provider-error=IllegalStateException; message-sha256:")
                .doesNotContain("opaque-test-token", "安全正文也必须在错误时转人工。");
        assertThat(audit.simulated()).isFalse();
    }

    @Test
    void invalidStructuredOutputFailsClosedAndStoresOnlyABoundedDigest() {
        stub.mode = StubMode.INVALID;

        Chapter held = store.addChapter(2L, 1L, "无效输出", "正文不能被不合法的模型输出放行。", true);
        ContentModerationAudit audit = onlyAuditFor(held.id());

        assertThat(held.status()).isEqualTo(ChapterStatus.NEEDS_REVIEW);
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.NEEDS_REVIEW);
        assertThat(audit.decision()).isEqualTo(ModerationDecision.INVALID_OUTPUT);
        assertThat(audit.rawResponse()).startsWith("sha256:").doesNotContain("正文不能");
        assertThat(audit.errorSummary()).contains("schema");
    }

    private ContentModerationAudit onlyAuditFor(long chapterId) {
        List<ContentModerationAudit> audits = store.moderationAudits("CHAPTER", 50).stream()
                .filter(item -> item.contentId() == chapterId)
                .toList();
        assertThat(audits).hasSize(1);
        return audits.getFirst();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class StubModerationConfiguration {
        @Bean
        @Primary
        StubModerationClient contentModelModerationClient() {
            return new StubModerationClient();
        }
    }

    static class StubModerationClient implements ContentModelModerationClient {
        volatile StubMode mode = StubMode.ERROR;

        @Override
        public ModelModerationResult moderate(ContentModerationRequest request) {
            Instant startedAt = Instant.now();
            if (mode == StubMode.ERROR) {
                throw new IllegalStateException(
                        "Authorization: Bearer opaque-test-token; request=" + request.content());
            }
            return ModelModerationResult.invalidOutput(
                    "TEST_QWEN",
                    "test-model",
                    "Qwen output did not match the required JSON moderation schema.",
                    "{\"malformed\":\"正文不能被存入审核原始响应\"}",
                    "test-request",
                    startedAt);
        }
    }

    enum StubMode {
        ERROR,
        INVALID
    }
}
