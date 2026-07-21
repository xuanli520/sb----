package cn.edu.training.novel;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:author_analytics_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorAnalyticsIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";
    private static final String DEVELOPMENT_PRINCIPAL = "X-Novel-Development-Principal";

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "reader"))
                .build();
    }

    @Test
    void returnsOnlyOwnedDurableMetricsWithPublishedCalculationSemantics() throws Exception {
        Instant julyOne = Instant.parse("2026-06-30T16:15:00Z");
        Instant julyTwo = Instant.parse("2026-07-01T16:15:00Z");
        insertShelf(301L, 1L, julyOne);
        insertShelf(302L, 1L, julyTwo);
        insertShelf(303L, 2L, julyOne);

        successfulPurchase(401L, 1L, 30L, julyOne);
        successfulPurchase(402L, 1L, 20L, julyTwo);
        orphanPurchase(403L, 1L, 900L, julyTwo);
        redemptionEntitlement(404L, 1L, julyTwo);
        successfulPurchase(405L, 2L, 700L, julyOne);

        jdbc.update("UPDATE novel_chapter SET content = ? WHERE id = 1001", "abcdefghij");
        jdbc.update(
                "INSERT INTO novel_chapter(id, book_id, title, content, published, status, order_no, created_at, updated_at) "
                        + "VALUES (1101, 1, 'second', 'abcdefghij', TRUE, 'PUBLISHED', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        insertProgress(501L, 1L, 1001L, 5, julyOne);
        insertProgress(502L, 1L, 1101L, 10, julyTwo);
        insertProgress(503L, 2L, 1002L, 10, julyOne);
        insertProgress(504L, 1L, 1101L, 10, Instant.parse("2026-07-03T16:00:00Z"));
        // Immutable activity, unlike the current progress rows above, proves the first-read
        // cohort and D1 return. The book-two row must never reach author 2's report.
        insertActivity(601L, 1L, "2026-07-01");
        insertActivity(601L, 1L, "2026-07-02");
        insertActivity(602L, 2L, "2026-07-01");
        insertAuthorSubscription(701L, 2L, 1L, 14, julyOne);
        insertAuthorSubscription(702L, 4L, 2L, 30, julyOne);

        mvc.perform(get("/api/v1/author/analytics")
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-03"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summary.currentFavoriteCount").value(2))
                .andExpect(jsonPath("$.data.summary.purchaseCount").value(2))
                .andExpect(jsonPath("$.data.summary.purchaseTokenAmount").value(50))
                .andExpect(jsonPath("$.data.summary.amountUnit").value("TOKEN"))
                .andExpect(jsonPath("$.data.summary.activeReaderBookCount").value(2))
                .andExpect(jsonPath("$.data.summary.activeReaderCount").value(2))
                .andExpect(jsonPath("$.data.summary.completedReaderBookCount").value(1))
                .andExpect(jsonPath("$.data.summary.averageReadThroughPercent").value(62.5))
                .andExpect(jsonPath("$.data.dailyTrend.length()").value(3))
                .andExpect(jsonPath("$.data.dailyTrend[0].date").value("2026-07-01"))
                .andExpect(jsonPath("$.data.dailyTrend[0].favoriteAddCount").value(1))
                .andExpect(jsonPath("$.data.dailyTrend[0].purchaseCount").value(1))
                .andExpect(jsonPath("$.data.dailyTrend[0].purchaseTokenAmount").value(30))
                .andExpect(jsonPath("$.data.dailyTrend[1].date").value("2026-07-02"))
                .andExpect(jsonPath("$.data.dailyTrend[1].favoriteAddCount").value(1))
                .andExpect(jsonPath("$.data.dailyTrend[1].purchaseCount").value(1))
                .andExpect(jsonPath("$.data.dailyTrend[2].favoriteAddCount").value(0))
                .andExpect(jsonPath("$.data.bookMetrics.length()").value(1))
                .andExpect(jsonPath("$.data.bookMetrics[0].bookId").value(1))
                .andExpect(jsonPath("$.data.bookMetrics[0].currentFavoriteCount").value(2))
                .andExpect(jsonPath("$.data.bookMetrics[0].purchaseTokenAmount").value(50))
                .andExpect(jsonPath("$.data.bookMetrics[0].averageReadThroughPercent").value(62.5))
                .andExpect(jsonPath("$.data.subscriptionMetrics.attributedGrantCount").value(1))
                .andExpect(jsonPath("$.data.subscriptionMetrics.attributedReaderCount").value(1))
                .andExpect(jsonPath("$.data.subscriptionMetrics.membershipDayCount").value(14))
                .andExpect(jsonPath("$.data.retentionMetrics.cohortReaderBookCount").value(1))
                .andExpect(jsonPath("$.data.retentionMetrics.day1EligibleReaderBookCount").value(1))
                .andExpect(jsonPath("$.data.retentionMetrics.day1RetainedReaderBookCount").value(1))
                .andExpect(jsonPath("$.data.retentionMetrics.day1RetentionPercent").value(100.0))
                .andExpect(jsonPath("$.data.retentionMetrics.day7EligibleReaderBookCount").value(0))
                .andExpect(jsonPath("$.data.availability.subscription.available").value(true))
                .andExpect(jsonPath("$.data.availability.subscription.reason").value(
                        "Author-attributed membership redemption ledger is available."))
                .andExpect(jsonPath("$.data.availability.retention.available").value(true))
                .andExpect(jsonPath("$.data.meta.timeZone").value("Asia/Shanghai"))
                .andExpect(jsonPath("$.data.meta.dateBoundary").value("FROM_INCLUSIVE_TO_INCLUSIVE"))
                .andExpect(jsonPath("$.data.meta.shelfTrendInclusion").value(
                        "CURRENT_BOOKSHELF_ROWS_ADDED_IN_WINDOW; REMOVED_ROWS_ARE_NOT_RETAINED"))
                .andExpect(jsonPath("$.data.meta.purchaseInclusion").value(
                        "PURCHASE_ENTITLEMENT_WITH_MATCHING_BOOK_PURCHASE_TOKEN_DEBIT"))
                .andExpect(jsonPath("$.data.meta.subscriptionInclusion").value(
                        "AUTHOR_ATTRIBUTED_MEMBERSHIP_REDEMPTION_LEDGER; COMPOSITE_REDEMPTION_CODE_BOOK_OWNER_SNAPSHOTTED_AT_GRANT"))
                .andExpect(jsonPath("$.data.meta.retentionDefinition").value(
                        "FIRST_READING_PROGRESS_ACTIVITY_DATE_PER_READER_BOOK; SAME_READER_BOOK_ACTIVITY_ON_COHORT_DATE_PLUS_1_OR_PLUS_7; ONLY_COHORTS_MATURED_BY_OBSERVED_THROUGH_ARE_ELIGIBLE"));
    }

    @Test
    void rejectsForeignBookAndInvalidOrUnboundedRangesBeforeReturningData() throws Exception {
        mvc.perform(get("/api/v1/author/analytics")
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .param("bookId", "2")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-01"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/author/analytics")
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .param("from", "2026-07-01"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/author/analytics")
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .param("from", "2026-07-01")
                        .param("to", "2026-10-01"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/author/analytics")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-01"))
                .andExpect(status().isForbidden());
    }

    private void insertShelf(long userId, long bookId, Instant addedAt) {
        jdbc.update(
                "INSERT INTO novel_reader_bookshelf(user_id, book_id, added_at) VALUES (?, ?, ?)",
                userId,
                bookId,
                Timestamp.from(addedAt));
    }

    private void successfulPurchase(long userId, long bookId, long amount, Instant acquiredAt) {
        jdbc.update(
                "INSERT INTO novel_book_entitlement(user_id, book_id, source_type, source_reference, purchase_amount, acquired_at) "
                        + "VALUES (?, ?, 'PURCHASE', ?, ?, ?)",
                userId,
                bookId,
                Long.toString(bookId),
                amount,
                Timestamp.from(acquiredAt));
        jdbc.update(
                "INSERT INTO novel_token_ledger(user_id, change_amount, balance_after, transaction_type, reference_type, reference_id, created_at) "
                        + "VALUES (?, ?, 1000, 'BOOK_PURCHASE', 'BOOK', ?, ?)",
                userId,
                -amount,
                Long.toString(bookId),
                Timestamp.from(acquiredAt));
    }

    private void orphanPurchase(long userId, long bookId, long amount, Instant acquiredAt) {
        jdbc.update(
                "INSERT INTO novel_book_entitlement(user_id, book_id, source_type, source_reference, purchase_amount, acquired_at) "
                        + "VALUES (?, ?, 'PURCHASE', ?, ?, ?)",
                userId,
                bookId,
                Long.toString(bookId),
                amount,
                Timestamp.from(acquiredAt));
    }

    private void redemptionEntitlement(long userId, long bookId, Instant acquiredAt) {
        jdbc.update(
                "INSERT INTO novel_book_entitlement(user_id, book_id, source_type, source_reference, purchase_amount, acquired_at) "
                        + "VALUES (?, ?, 'REDEMPTION', 'TEST-CODE', 0, ?)",
                userId,
                bookId,
                Timestamp.from(acquiredAt));
    }

    private void insertProgress(long userId, long bookId, long chapterId, int offset, Instant updatedAt) {
        jdbc.update(
                "INSERT INTO novel_reader_progress(user_id, book_id, chapter_id, character_offset, updated_at) VALUES (?, ?, ?, ?, ?)",
                userId,
                bookId,
                chapterId,
                offset,
                Timestamp.from(updatedAt));
    }

    private void insertActivity(long userId, long bookId, String activityDate) {
        Instant occurredAt = Date.valueOf(activityDate).toLocalDate()
                .atStartOfDay(java.time.ZoneId.of("Asia/Shanghai")).toInstant();
        jdbc.update(
                "INSERT INTO novel_reader_activity_event(user_id, book_id, chapter_id, event_type, activity_date, occurred_at) "
                        + "VALUES (?, ?, ?, 'READING_PROGRESS', ?, ?)",
                userId,
                bookId,
                bookId == 1L ? 1001L : 1002L,
                Date.valueOf(activityDate),
                Timestamp.from(occurredAt));
    }

    private void insertAuthorSubscription(long readerUserId, long authorId, long bookId, int days, Instant occurredAt) {
        jdbc.update(
                "INSERT INTO novel_membership_ledger(user_id, membership_days, valid_from, valid_until, transaction_type, reference_type, reference_id, created_at) "
                        + "VALUES (?, ?, ?, ?, 'REDEMPTION', 'REDEMPTION_CODE', ?, ?)",
                readerUserId,
                days,
                Timestamp.from(occurredAt),
                Timestamp.from(occurredAt.plusSeconds(days * 86_400L)),
                "ANALYTICS-" + readerUserId,
                Timestamp.from(occurredAt));
        Long membershipLedgerId = jdbc.queryForObject("SELECT MAX(id) FROM novel_membership_ledger", Long.class);
        jdbc.update(
                "INSERT INTO novel_author_subscription_ledger(membership_ledger_id, reader_user_id, author_id, book_id, membership_days, source_type, source_reference, occurred_at) "
                        + "VALUES (?, ?, ?, ?, ?, 'MEMBERSHIP_REDEMPTION', ?, ?)",
                membershipLedgerId,
                readerUserId,
                authorId,
                bookId,
                days,
                "ANALYTICS-" + readerUserId,
                Timestamp.from(occurredAt));
    }
}
