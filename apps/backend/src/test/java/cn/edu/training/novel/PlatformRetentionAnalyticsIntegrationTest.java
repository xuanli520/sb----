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
        "spring.datasource.url=jdbc:h2:mem:platform_retention_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class PlatformRetentionAnalyticsIntegrationTest {
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
                        .header(DEVELOPMENT_PRINCIPAL, "admin"))
                .build();
    }

    @Test
    void reportsWholePlatformAndChannelCohortsWithEligibilityAwareD1AndD7() throws Exception {
        attribute(401L, "WECHAT");
        attribute(403L, "SEARCH");
        // July 1 first readers: WECHAT returns on both D1 and D7; direct only returns D1.
        activity(401L, "2026-07-01");
        activity(401L, "2026-07-02");
        activity(401L, "2026-07-08");
        activity(402L, "2026-07-01");
        activity(402L, "2026-07-02");
        // SEARCH is eligible for both windows as of July 10, but only returns on D1.
        activity(403L, "2026-07-02");
        activity(403L, "2026-07-03");
        // It is outside the selected cohort range and must not affect the summary denominator.
        activity(404L, "2026-07-10");

        mvc.perform(get("/api/v1/admin/analytics/retention")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-02")
                        .param("asOf", "2026-07-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.summary.activeReaderCount").value(3))
                .andExpect(jsonPath("$.data.summary.metric.cohortReaderCount").value(3))
                .andExpect(jsonPath("$.data.summary.metric.day1EligibleReaderCount").value(3))
                .andExpect(jsonPath("$.data.summary.metric.day1RetainedReaderCount").value(3))
                .andExpect(jsonPath("$.data.summary.metric.day1RetentionPercent").value(100.0))
                .andExpect(jsonPath("$.data.summary.metric.day7EligibleReaderCount").value(3))
                .andExpect(jsonPath("$.data.summary.metric.day7RetainedReaderCount").value(1))
                .andExpect(jsonPath("$.data.summary.metric.day7RetentionPercent").value(33.333333333333336))
                .andExpect(jsonPath("$.data.dailyCohorts.length()").value(3))
                .andExpect(jsonPath("$.data.dailyCohorts[0].cohortDate").value("2026-07-01"))
                .andExpect(jsonPath("$.data.dailyCohorts[0].channel").value("DIRECT"))
                .andExpect(jsonPath("$.data.dailyCohorts[0].metric.day7RetainedReaderCount").value(0))
                .andExpect(jsonPath("$.data.dailyCohorts[1].channel").value("WECHAT"))
                .andExpect(jsonPath("$.data.dailyCohorts[1].metric.day7RetainedReaderCount").value(1))
                .andExpect(jsonPath("$.data.dailyCohorts[2].cohortDate").value("2026-07-02"))
                .andExpect(jsonPath("$.data.dailyCohorts[2].channel").value("SEARCH"))
                .andExpect(jsonPath("$.data.channels.length()").value(3))
                .andExpect(jsonPath("$.data.channels[0].channel").value("DIRECT"))
                .andExpect(jsonPath("$.data.channels[1].channel").value("SEARCH"))
                .andExpect(jsonPath("$.data.channels[2].channel").value("WECHAT"))
                .andExpect(jsonPath("$.data.meta.timeZone").value("Asia/Shanghai"))
                .andExpect(jsonPath("$.data.meta.channelAttributionDefinition")
                        .value("FIRST_TOUCH_REGISTRATION_CHANNEL; MISSING_ATTRIBUTION_IS_DIRECT"))
                .andExpect(jsonPath("$.data.meta.privacyBoundary")
                        .value("STORES_CONTROLLED_CHANNEL_CATEGORY_ONLY; NO_IP_REFERRER_URL_OR_DEVICE_FINGERPRINT"));
    }

    @Test
    void deniesReadersAndRejectsInvalidReportWindows() throws Exception {
        mvc.perform(get("/api/v1/admin/analytics/retention")
                        .header(DEVELOPMENT_PRINCIPAL, "reader")
                        .param("from", "2026-07-01")
                        .param("to", "2026-07-02")
                        .param("asOf", "2026-07-10"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/analytics/retention")
                        .param("from", "2026-07-01")
                        .param("asOf", "2026-07-10"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/admin/analytics/retention")
                        .param("from", "2026-07-03")
                        .param("to", "2026-07-01")
                        .param("asOf", "2026-07-10"))
                .andExpect(status().isBadRequest());
    }

    private void attribute(long userId, String channel) {
        jdbc.update(
                "INSERT INTO novel_channel_attribution(user_id, channel, attribution_source, attributed_at) VALUES (?, ?, 'REGISTRATION', CURRENT_TIMESTAMP)",
                userId,
                channel);
    }

    private void activity(long userId, String date) {
        Instant occurredAt = Date.valueOf(date).toLocalDate().atStartOfDay(java.time.ZoneId.of("Asia/Shanghai")).toInstant();
        jdbc.update(
                "INSERT INTO novel_reader_activity_event(user_id, book_id, chapter_id, event_type, activity_date, occurred_at) "
                        + "VALUES (?, ?, ?, 'READING_PROGRESS', ?, ?)",
                userId,
                1L,
                1001L,
                Date.valueOf(date),
                Timestamp.from(occurredAt));
    }
}
