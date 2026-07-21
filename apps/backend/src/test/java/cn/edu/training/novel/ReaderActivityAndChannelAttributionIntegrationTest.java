package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.NovelStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.web.server.ResponseStatusException;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:reader_activity_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ReaderActivityAndChannelAttributionIntegrationTest {
    @Autowired AuthService authService;
    @Autowired NovelStore store;
    @Autowired JdbcTemplate jdbc;

    @Test
    void capturesOnlyWhitelistedFirstTouchChannelAndCreatesOneImmutableDailyActivityPerBook() {
        AuthService.AuthenticatedSession session = authService.register(
                "retention.wechat", "渠道读者", "a-secure-password", "wechat");
        long userId = session.user().id();
        AuthService.AuthenticatedSession secondSession = authService.register(
                "retention.search", "第二位渠道读者", "a-secure-password", "SEARCH");

        assertThat(jdbc.queryForObject(
                "SELECT channel FROM novel_channel_attribution WHERE user_id = ?", String.class, userId))
                .isEqualTo("WECHAT");
        assertThat(jdbc.queryForObject(
                "SELECT channel FROM novel_channel_attribution WHERE user_id = ?", String.class, secondSession.user().id()))
                .isEqualTo("SEARCH");

        store.saveProgress(userId, 1L, 1001L, 1);
        store.saveProgress(userId, 1L, 1001L, 35);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_reader_activity_event WHERE user_id = ? AND book_id = ? AND event_type = 'READING_PROGRESS'",
                Long.class,
                userId,
                1L)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT chapter_id FROM novel_reader_activity_event WHERE user_id = ? AND book_id = ?", Long.class, userId, 1L))
                .isEqualTo(1001L);
    }

    @Test
    void defaultsMissingChannelToDirectAndRejectsUncontrolledValues() {
        AuthService.AuthenticatedSession direct = authService.register(
                "retention.direct", "直接读者", "a-secure-password");
        assertThat(jdbc.queryForObject(
                "SELECT channel FROM novel_channel_attribution WHERE user_id = ?", String.class, direct.user().id()))
                .isEqualTo("DIRECT");

        assertThatThrownBy(() -> authService.register(
                "retention.invalid", "无效渠道", "a-secure-password", "https://tracker.example/campaign"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(exception -> assertThat(((ResponseStatusException) exception).getStatusCode())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }
}
