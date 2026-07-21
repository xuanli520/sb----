package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.AccountProfileService;
import cn.edu.training.novel.service.AuthService;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "novel.internal-api-key=account-profile-test-internal-key",
        "novel.development-auth-enabled=false",
        "novel.scheduled-publication.enabled=false",
        "novel.auth.bcrypt-strength=4",
        "spring.datasource.url=jdbc:h2:mem:account_profile_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AccountProfileAndEntitlementIntegrationTest {
    private static final String INTERNAL_KEY = "account-profile-test-internal-key";
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Autowired AuthService authService;
    @Autowired AccountProfileService accountProfileService;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    @Test
    void currentSessionUpdatesOnlyItsProfileAndReadsOnlyItsOwnEntitlements() throws Exception {
        AuthService.AuthenticatedSession accountA = authService.register(
                "entitlement.a@example.test", "初始读者", PASSWORD);
        AuthService.AuthenticatedSession accountB = authService.register(
                "entitlement.b@example.test", "另一位读者", PASSWORD);
        Instant now = Instant.now();

        jdbc.update(
                "INSERT INTO novel_membership_entitlement(user_id, expires_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                accountA.user().id(),
                Timestamp.from(now.plusSeconds(86_400)));
        jdbc.update(
                "INSERT INTO novel_membership_entitlement(user_id, expires_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                accountB.user().id(),
                Timestamp.from(now.minusSeconds(86_400)));
        jdbc.update(
                "INSERT INTO novel_book_entitlement(user_id, book_id, source_type, source_reference, purchase_amount, acquired_at) "
                        + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                accountA.user().id(), 1L, "TOKEN_PURCHASE", "account-a-book-1", 45L);
        jdbc.update(
                "INSERT INTO novel_book_entitlement(user_id, book_id, source_type, source_reference, purchase_amount, acquired_at) "
                        + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                accountB.user().id(), 2L, "REDEMPTION", "account-b-book-2", 0L);

        mvc.perform(put("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", accountA.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"  更新后的读者  \"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(accountA.user().id()))
                .andExpect(jsonPath("$.data.name").value("更新后的读者"));

        assertThat(jdbc.queryForObject(
                "SELECT display_name FROM novel_account WHERE id = ?", String.class, accountA.user().id()))
                .isEqualTo("更新后的读者");
        assertThat(authService.resolveBffSession(accountA.bffSessionId()).orElseThrow().name())
                .isEqualTo("更新后的读者");
        assertThat(jdbc.queryForObject(
                "SELECT display_name FROM novel_account WHERE id = ?", String.class, accountB.user().id()))
                .isEqualTo("另一位读者");

        mvc.perform(get("/api/v1/account/entitlements")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", accountA.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.membership.active").value(true))
                .andExpect(jsonPath("$.data.books.length()").value(1))
                .andExpect(jsonPath("$.data.books[0].bookId").value(1))
                .andExpect(jsonPath("$.data.books[0].bookTitle").value("星海拾光"))
                .andExpect(jsonPath("$.data.books[0].sourceType").value("TOKEN_PURCHASE"))
                .andExpect(jsonPath("$.data.books[0].sourceReference").value("account-a-book-1"))
                .andExpect(jsonPath("$.data.books[0].purchaseAmount").value(45))
                .andExpect(jsonPath("$.data.books[0].amountUnit").value("TOKEN"));

        mvc.perform(get("/api/v1/account/entitlements")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", accountB.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.membership.active").value(false))
                .andExpect(jsonPath("$.data.books.length()").value(1))
                .andExpect(jsonPath("$.data.books[0].bookId").value(2))
                .andExpect(jsonPath("$.data.books[0].sourceReference").value("account-b-book-2"));
    }

    @Test
    void profileUpdateRejectsBlankOversizedAndControlCharacterNamesWithoutChangingTheStoredName() throws Exception {
        AuthService.AuthenticatedSession account = authService.register(
                "invalid.profile@example.test", "保持原名", PASSWORD);

        mvc.perform(put("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", account.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"   \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", account.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"" + "x".repeat(129) + "\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", account.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"带换行\\n名称\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("display name must not contain control characters or line breaks"));

        assertThat(jdbc.queryForObject(
                "SELECT display_name FROM novel_account WHERE id = ?", String.class, account.user().id()))
                .isEqualTo("保持原名");
    }

    @Test
    void disabledPersistedAccountsCannotReadOrUpdateProfileOrEntitlements() throws Exception {
        AuthService.AuthenticatedSession account = authService.register(
                "disabled.profile@example.test", "待禁用读者", PASSWORD);
        authService.setEnabled(account.user().id(), false);

        assertThat(authService.resolveBffSession(account.bffSessionId())).isEmpty();
        assertThatThrownBy(() -> accountProfileService.updateDisplayName(account.user(), "不应写入"))
                .isInstanceOf(SecurityException.class)
                .hasMessage("account is disabled");
        mvc.perform(put("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", account.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"不应写入\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/account/profile")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", account.bffSessionId()))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/account/entitlements")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", account.bffSessionId()))
                .andExpect(status().isUnauthorized());
    }
}
