package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import cn.edu.training.novel.service.NovelStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** Verifies the production composite-redemption write path, not only analytics read fixtures. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:author_subscription_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorSubscriptionAttributionIntegrationTest {
    @Autowired NovelStore store;
    @Autowired JdbcTemplate jdbc;

    @Test
    void snapshotsCurrentBookOwnerOnceWhenACompositeMembershipCodeIsRedeemed() {
        createMembershipCode("AUTHOR-MEMBER-01", 1L, 30);

        store.redeem(771L, "AUTHOR-MEMBER-01");

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_membership_ledger", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_author_subscription_ledger", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT author_id FROM novel_author_subscription_ledger WHERE source_reference = ?", Long.class, "AUTHOR-MEMBER-01"))
                .isEqualTo(2L);
        assertThat(jdbc.queryForObject(
                "SELECT book_id FROM novel_author_subscription_ledger WHERE source_reference = ?", Long.class, "AUTHOR-MEMBER-01"))
                .isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT membership_days FROM novel_author_subscription_ledger WHERE source_reference = ?", Integer.class, "AUTHOR-MEMBER-01"))
                .isEqualTo(30);

        assertThatThrownBy(() -> store.redeem(771L, "AUTHOR-MEMBER-01"))
                .isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_author_subscription_ledger", Long.class)).isEqualTo(1L);
    }

    @Test
    void leavesUnattributedMembershipOutOfTheAuthorLedger() {
        createMembershipCode("PLATFORM-MEMBER-01", null, 15);

        store.redeem(772L, "PLATFORM-MEMBER-01");

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_membership_ledger", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_author_subscription_ledger", Long.class)).isZero();
    }

    private void createMembershipCode(String code, Long bookId, int membershipDays) {
        jdbc.update(
                "INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, book_id, membership_days, status, created_at, updated_at) "
                        + "VALUES (?, 'AUTHOR-ANALYTICS', 'COMPOSITE', 0, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                code,
                bookId,
                membershipDays);
    }
}
