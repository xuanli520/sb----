package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** Exercises the administrator API and the persisted redemption/entitlement invariants together. */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:redemption_admin_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class RedemptionCodeAdministrationIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .build();
    }

    @Test
    void onlyAdministratorsCanGenerateAndPageThroughBatches() throws Exception {
        mvc.perform(get("/api/v1/admin/redemption-codes"))
                .andExpect(status().isForbidden());

        String generated = mvc.perform(post("/api/v1/admin/redemption-codes/generate")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":2,\"batchNo\":\"summer-2026\",\"codePrefix\":\"SUM\",\"tokenAmount\":60,\"expiresAt\":\"2030-01-01T00:00:00Z\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.batchNo").value("SUMMER-2026"))
                .andExpect(jsonPath("$.data.codes[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.data.codes[0].benefitType").value("TOKEN"))
                .andReturn().getResponse().getContentAsString();
        String firstCode = JsonPath.read(generated, "$.data.codes[0].code");
        String secondCode = JsonPath.read(generated, "$.data.codes[1].code");

        assertThat(firstCode).matches("SUM-[A-Z0-9]{16}");
        assertThat(secondCode).matches("SUM-[A-Z0-9]{16}").isNotEqualTo(firstCode);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_redemption_code WHERE batch_no = 'SUMMER-2026' AND created_by_user_id = 1",
                Long.class)).isEqualTo(2L);

        mvc.perform(get("/api/v1/admin/redemption-codes")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .param("batchNo", "summer-2026")
                        .param("benefitType", "token")
                        .param("status", "active")
                        .param("page", "0")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(2))
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].batchNo").value("SUMMER-2026"));
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%admin redemption-code generate batch=SUMMER-2026 quantity=2 user=1%'",
                Long.class)).isEqualTo(1L);
    }

    @Test
    void importedCompositeCodeGrantsAllBenefitsOnceAndWritesIndependentLedgers() throws Exception {
        mvc.perform(post("/api/v1/admin/redemption-codes/import")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\" member-book-25 \",\"batchNo\":\"import-2026\",\"tokenAmount\":25,\"membershipDays\":7,\"bookId\":1,\"expiresAt\":\"2030-01-01T00:00:00Z\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code").value("MEMBER-BOOK-25"))
                .andExpect(jsonPath("$.data.batchNo").value("IMPORT-2026"))
                .andExpect(jsonPath("$.data.benefitType").value("COMPOSITE"))
                .andExpect(jsonPath("$.data.membershipDays").value(7));

        mvc.perform(post("/api/v1/account/redeem")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"MEMBER-BOOK-25\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code").value("MEMBER-BOOK-25"))
                .andExpect(jsonPath("$.data.tokens").value(25))
                .andExpect(jsonPath("$.data.balance").value(25));

        assertThat(jdbc.queryForObject(
                "SELECT status FROM novel_redemption_code WHERE code = 'MEMBER-BOOK-25'", String.class)).isEqualTo("REDEEMED");
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_book_entitlement WHERE user_id = 3 AND book_id = 1", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT membership_days FROM novel_membership_ledger WHERE user_id = 3 AND reference_id = 'MEMBER-BOOK-25'", Integer.class)).isEqualTo(7);
        Timestamp membershipExpiry = jdbc.queryForObject(
                "SELECT expires_at FROM novel_membership_entitlement WHERE user_id = 3", Timestamp.class);
        assertThat(membershipExpiry.toInstant()).isAfter(java.time.Instant.now());
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_token_ledger WHERE user_id = 3 AND reference_id = 'MEMBER-BOOK-25'", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%admin redemption-code import batch=IMPORT-2026%'",
                Long.class)).isEqualTo(1L);
    }

    @Test
    void validationDuplicateAndDisableStateTransitionsAreExplicit() throws Exception {
        String endpoint = "/api/v1/admin/redemption-codes/import";
        mvc.perform(post(endpoint)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"BAD!\",\"batchNo\":\"TEST-2026\",\"tokenAmount\":10}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(endpoint)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"NO-BENEFIT-2026\",\"batchNo\":\"TEST-2026\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/admin/redemption-codes/generate")
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quantity\":0,\"tokenAmount\":10}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(endpoint)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"PAST-2026\",\"batchNo\":\"TEST-2026\",\"tokenAmount\":10,\"expiresAt\":\"2020-01-01T00:00:00Z\"}"))
                .andExpect(status().isBadRequest());

        String activeCode = "DISABLE-2026";
        String activePayload = "{\"code\":\"" + activeCode + "\",\"batchNo\":\"TEST-2026\",\"tokenAmount\":10}";
        mvc.perform(post(endpoint).header(TestBffSessions.HEADER, TestBffSessions.ADMIN).contentType(MediaType.APPLICATION_JSON).content(activePayload))
                .andExpect(status().isOk());
        mvc.perform(post(endpoint).header(TestBffSessions.HEADER, TestBffSessions.ADMIN).contentType(MediaType.APPLICATION_JSON).content(activePayload))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/v1/admin/redemption-codes/{code}/disable", activeCode)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"campaign recalled\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DISABLED"));
        mvc.perform(post("/api/v1/account/redeem").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"" + activeCode + "\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/admin/redemption-codes/{code}/disable", activeCode)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());

        String redeemedCode = "REDEEMED-2026";
        mvc.perform(post(endpoint)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"" + redeemedCode + "\",\"batchNo\":\"TEST-2026\",\"tokenAmount\":5}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/account/redeem")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"" + redeemedCode + "\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/admin/redemption-codes/{code}/disable", redeemedCode)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject(
                "SELECT disabled_by_user_id FROM novel_redemption_code WHERE code = ?", Long.class, activeCode)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%admin redemption-code disable codeSuffix=2026 user=1 reason=campaign recalled%'",
                Long.class)).isEqualTo(1L);
    }
}
