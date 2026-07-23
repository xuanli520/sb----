package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.NovelStore;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Exercises V33 reader engagement with real opaque BFF sessions rather than test-only headers. */
@SpringBootTest(properties = {
        "novel.internal-api-key=reader-engagement-test-internal-key",
        "novel.development-auth-enabled=false",
        "novel.scheduled-publication.enabled=false",
        "novel.auth.bcrypt-strength=4",
        "spring.datasource.url=jdbc:h2:mem:reader_engagement_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ReaderEngagementAnalyticsIntegrationTest {
    private static final String INTERNAL_KEY = "reader-engagement-test-internal-key";
    private static final String PASSWORD = "correct-horse-battery-staple";
    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");

    @Autowired AuthService authService;
    @Autowired NovelStore store;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    @Test
    void recordsFreeSubscriptionAndFavoriteTransitionsAndKeepsMembershipAttributionSeparate() throws Exception {
        AuthService.AuthenticatedSession reader = authService.register(
                "engagement.reader@example.test", "互动读者", PASSWORD);

        mvc.perform(put("/api/v1/account/subscriptions/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bookId").value(1))
                .andExpect(jsonPath("$.data.subscribed").value(true))
                .andExpect(jsonPath("$.data.subscribedAt").exists());
        // A retry sees the same state and must not manufacture an additional event.
        mvc.perform(put("/api/v1/account/subscriptions/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.subscribed").value(true));
        mvc.perform(delete("/api/v1/account/subscriptions/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.subscribed").value(false))
                .andExpect(jsonPath("$.data.subscribedAt").doesNotExist());
        mvc.perform(delete("/api/v1/account/subscriptions/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.subscribed").value(false));

        mvc.perform(post("/api/v1/account/bookshelf/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(true));
        mvc.perform(post("/api/v1/account/bookshelf/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(false));

        assertThat(count("novel_book_subscription_event")).isEqualTo(2L);
        assertThat(count("novel_reader_favorite_event")).isEqualTo(2L);

        AuthService.AuthenticatedSession author = authService.register(
                "engagement.author@example.test", "真实作者", PASSWORD);
        authService.grantRole(author.user().id(), Role.AUTHOR);
        jdbc.update("UPDATE novel_book SET author_id = ? WHERE id = 1", author.user().id());
        insertAttribution(reader.user().id(), author.user().id());
        jdbc.update(
                "INSERT INTO novel_book_interaction_stat(book_id, rating_count, rating_total) VALUES (1, 2, 9)");

        LocalDate today = LocalDate.now(SHANGHAI);
        mvc.perform(get("/api/v1/author/analytics")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", author.bffSessionId())
                        .param("from", today.toString())
                        .param("to", today.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summary.currentFavoriteCount").value(0))
                .andExpect(jsonPath("$.data.summary.currentSubscriptionCount").value(0))
                .andExpect(jsonPath("$.data.summary.ratingCount").value(2))
                .andExpect(jsonPath("$.data.summary.averageRating").value(4.5))
                .andExpect(jsonPath("$.data.dailyTrend[0].favoriteAddCount").value(1))
                .andExpect(jsonPath("$.data.dailyTrend[0].favoriteRemoveCount").value(1))
                .andExpect(jsonPath("$.data.dailyTrend[0].subscriptionAddCount").value(1))
                .andExpect(jsonPath("$.data.dailyTrend[0].subscriptionRemoveCount").value(1))
                .andExpect(jsonPath("$.data.bookMetrics[0].ratingCount").value(2))
                .andExpect(jsonPath("$.data.bookMetrics[0].averageRating").value(4.5))
                .andExpect(jsonPath("$.data.subscriptionMetrics.currentSubscriptionCount").value(0))
                .andExpect(jsonPath("$.data.subscriptionMetrics.subscriptionAddCount").value(1))
                .andExpect(jsonPath("$.data.membershipAttributionMetrics.attributedGrantCount").value(1))
                .andExpect(jsonPath("$.data.membershipAttributionMetrics.membershipDayCount").value(14))
                .andExpect(jsonPath("$.data.availability.favorite.available").value(true))
                .andExpect(jsonPath("$.data.meta.historicalObservationBoundary").exists());
    }

    @Test
    void keepsCurrentCompletionWhenTheSelectedActivityWindowHasNoReadingEvent() throws Exception {
        AuthService.AuthenticatedSession author = authService.register(
                "completion.author@example.test", "完成度作者", PASSWORD);
        authService.grantRole(author.user().id(), Role.AUTHOR);
        jdbc.update("UPDATE novel_book SET author_id = ? WHERE id = 1", author.user().id());
        Instant yesterday = LocalDate.now(SHANGHAI).minusDays(1).atStartOfDay(SHANGHAI).toInstant();
        jdbc.update(
                "INSERT INTO novel_reader_progress(user_id, book_id, chapter_id, character_offset, updated_at) VALUES (?, 1, 1001, 3, ?)",
                901L,
                Timestamp.from(yesterday));

        LocalDate today = LocalDate.now(SHANGHAI);
        mvc.perform(get("/api/v1/author/analytics")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", author.bffSessionId())
                        .param("from", today.toString())
                        .param("to", today.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summary.activeReaderBookCount").value(0))
                .andExpect(jsonPath("$.data.summary.currentReaderBookCount").value(1))
                .andExpect(jsonPath("$.data.summary.currentReaderCount").value(1));
    }

    @Test
    void projectsRatingMetricsIntoCatalogBookshelfAndAuthorBookLists() throws Exception {
        AuthService.AuthenticatedSession author = authService.register(
                "presentation.author@example.test", "投影作者", PASSWORD);
        authService.grantRole(author.user().id(), Role.AUTHOR);
        jdbc.update("UPDATE novel_book SET author_id = ? WHERE id = 1", author.user().id());
        jdbc.update(
                "INSERT INTO novel_book_interaction_stat(book_id, rating_count, rating_total, visible_comment_count, recommendation_vote_count, monthly_vote_count) "
                        + "VALUES (1, 2, 9, 3, 4, 5)");

        AuthService.AuthenticatedSession reader = authService.register(
                "presentation.reader@example.test", "投影读者", PASSWORD);
        mvc.perform(post("/api/v1/account/bookshelf/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/public/hot")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].metrics.ratingCount").value(2))
                .andExpect(jsonPath("$.data[0].metrics.averageRating").value(4.5));
        mvc.perform(get("/api/v1/account/bookshelf")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].metrics.visibleCommentCount").value(3))
                .andExpect(jsonPath("$.data.items[0].metrics.ratingCount").value(2))
                .andExpect(jsonPath("$.data.meta.total").value(1));
        mvc.perform(get("/api/v1/author/books")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", author.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].metrics.recommendationVoteCount").value(4))
                .andExpect(jsonPath("$.data.items[0].metrics.monthlyVoteCount").value(5))
                .andExpect(jsonPath("$.data.meta.total").value(1));
    }

    @Test
    void restoresTheCurrentReadersRatingAndProjectsRatingChanges() throws Exception {
        AuthService.AuthenticatedSession reader = authService.register(
                "rating.reader@example.test", "评分读者", PASSWORD);

        mvc.perform(post("/api/v1/account/books/1/rating")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":4}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.average").value(4.0));
        mvc.perform(get("/api/v1/account/books/1/reading")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentUserRating").value(4));

        mvc.perform(post("/api/v1/account/books/1/rating")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.average").value(5.0));
        mvc.perform(get("/api/v1/public/hot")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].metrics.ratingCount").value(1))
                .andExpect(jsonPath("$.data[0].metrics.averageRating").value(5.0));
        mvc.perform(get("/api/v1/account/books/1/reading")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currentUserRating").value(5));
    }

    private long count(String table) {
        Long value = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
        return value == null ? 0 : value;
    }

    private void insertAttribution(long readerUserId, long authorUserId) {
        Instant now = Instant.now();
        jdbc.update(
                "INSERT INTO novel_membership_ledger(user_id, membership_days, valid_from, valid_until, transaction_type, reference_type, reference_id, created_at) "
                        + "VALUES (?, 14, ?, ?, 'REDEMPTION', 'REDEMPTION_CODE', 'ENGAGEMENT-ATTRIBUTION', ?)",
                readerUserId,
                Timestamp.from(now),
                Timestamp.from(now.plusSeconds(14 * 86_400L)),
                Timestamp.from(now));
        Long ledgerId = jdbc.queryForObject("SELECT MAX(id) FROM novel_membership_ledger", Long.class);
        jdbc.update(
                "INSERT INTO novel_author_subscription_ledger(membership_ledger_id, reader_user_id, author_id, book_id, membership_days, source_type, source_reference, occurred_at) "
                        + "VALUES (?, ?, ?, 1, 14, 'MEMBERSHIP_REDEMPTION', 'ENGAGEMENT-ATTRIBUTION', ?)",
                ledgerId,
                readerUserId,
                authorUserId,
                Timestamp.from(now));
    }
}
