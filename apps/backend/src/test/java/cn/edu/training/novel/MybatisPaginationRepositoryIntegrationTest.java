package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.domain.AdminAccountPage;
import cn.edu.training.novel.domain.AdminUserBehaviorEventPage;
import cn.edu.training.novel.domain.AuthorRewardRecord;
import cn.edu.training.novel.domain.CommentPage;
import cn.edu.training.novel.domain.ParagraphAnnotationPage;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AdminOperationsRepository;
import cn.edu.training.novel.service.AuthorRewardRepository;
import cn.edu.training.novel.service.InteractionRepository;
import cn.edu.training.novel.service.WalletRepository;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

/** Executes the MyBatis-Plus page paths without relying on retired development-principal headers. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:mybatis_pagination_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class MybatisPaginationRepositoryIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired InteractionRepository interactions;
    @Autowired AdminOperationsRepository operations;
    @Autowired AuthorRewardRepository rewards;
    @Autowired WalletRepository wallet;

    @Test
    void pagesCommentsAndAnnotationsWithTheExistingAuthorAdviceRules() {
        Instant occurredAt = Instant.parse("2026-07-20T01:00:00Z");
        jdbc.update(
                "INSERT INTO novel_comment(book_id, chapter_id, user_id, author_name, content, status, created_at, updated_at) "
                        + "VALUES (1, NULL, 9001, '分页读者', '待审评论', 'PENDING_REVIEW', ?, ?)",
                Timestamp.from(occurredAt),
                Timestamp.from(occurredAt));
        long commentId = requiredLong("SELECT MAX(id) FROM novel_comment");
        jdbc.update(
                "INSERT INTO novel_author_comment_moderation_advice(comment_id, book_id, author_user_id, recommendation, reason, created_at, updated_at) "
                        + "VALUES (?, 1, 2, 'RECOMMEND_VISIBLE', '作者建议', ?, ?)",
                commentId,
                Timestamp.from(occurredAt),
                Timestamp.from(occurredAt));

        CommentPage comments = interactions.findCommentsForBook(1, InteractionRepository.PENDING_REVIEW, 0, 1);
        assertThat(comments.total()).isEqualTo(1);
        assertThat(comments.items()).singleElement().satisfies(comment -> {
            assertThat(comment.id()).isEqualTo(commentId);
            assertThat(comment.authorModerationAdvice().recommendation()).isEqualTo("RECOMMEND_VISIBLE");
        });

        jdbc.update(
                "INSERT INTO novel_paragraph_annotation(book_id, chapter_id, user_id, author_name, paragraph_index, selection_start, "
                        + "selection_end, selected_text, note, share_intent, status, created_at, updated_at) "
                        + "VALUES (1, 1001, 9001, '分页读者', 0, 0, 1, '雨', '待审划线', TRUE, 'PENDING_REVIEW', ?, ?)",
                Timestamp.from(occurredAt),
                Timestamp.from(occurredAt));
        long annotationId = requiredLong("SELECT MAX(id) FROM novel_paragraph_annotation");
        jdbc.update(
                "INSERT INTO novel_author_annotation_moderation_advice(annotation_id, book_id, author_user_id, recommendation, reason, created_at, updated_at) "
                        + "VALUES (?, 1, 2, 'RECOMMEND_REJECTED', '作者建议', ?, ?)",
                annotationId,
                Timestamp.from(occurredAt),
                Timestamp.from(occurredAt));

        ParagraphAnnotationPage annotations = interactions.findParagraphAnnotationsForBook(
                1, InteractionRepository.PENDING_REVIEW, 0, 1);
        assertThat(annotations.total()).isEqualTo(1);
        assertThat(annotations.items()).singleElement().satisfies(annotation -> {
            assertThat(annotation.id()).isEqualTo(annotationId);
            assertThat(annotation.authorModerationAdvice().recommendation()).isEqualTo("RECOMMEND_REJECTED");
        });
    }

    @Test
    void pagesAdminAccountsAndRedactedBehaviorAuditLists() {
        jdbc.update(
                "INSERT INTO novel_account(login_name, display_name, password_hash, roles, enabled, created_at, updated_at) "
                        + "VALUES ('pager-account', '分页账户', 'hash', 'READER', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        long accountId = requiredLong("SELECT MAX(id) FROM novel_account");
        jdbc.update(
                "INSERT INTO novel_reader_progress(user_id, book_id, chapter_id, character_offset, updated_at) "
                        + "VALUES (?, 1, 1001, 3, CURRENT_TIMESTAMP)",
                accountId);
        jdbc.update(
                "INSERT INTO novel_account_status_audit(account_id, previous_enabled, enabled, reason, operator_user_id, created_at) "
                        + "VALUES (?, TRUE, FALSE, '分页测试', 1, CURRENT_TIMESTAMP)",
                accountId);
        jdbc.update(
                "INSERT INTO novel_operating_taxonomy_audit(taxonomy_id, taxonomy_type, action, details, operator_user_id, created_at) "
                        + "VALUES (1, 'CATEGORY', 'UPDATED', '分页测试', 1, CURRENT_TIMESTAMP)");

        AdminAccountPage accounts = operations.findAccounts(
                "pager-account", new AdminOperationsRepository.AccountFilter(true, Role.READER), 0, 1);
        assertThat(accounts.total()).isEqualTo(1);
        assertThat(accounts.items()).singleElement().satisfies(account -> assertThat(account.id()).isEqualTo(accountId));

        AdminUserBehaviorEventPage events = operations.findAccountBehaviorEvents(accountId, 0, 1);
        assertThat(events.total()).isEqualTo(1);
        assertThat(events.items()).singleElement().satisfies(event -> {
            assertThat(event.eventType()).isEqualTo("READING_PROGRESS");
            assertThat(event.bookId()).isEqualTo(1L);
        });
        assertThat(operations.findAccountStatusAudits(accountId, 1)).singleElement()
                .satisfies(audit -> assertThat(audit.reason()).isEqualTo("分页测试"));
        assertThat(operations.findTaxonomyAudits(AdminOperationsRepository.TaxonomyType.CATEGORY, 1)).singleElement()
                .satisfies(audit -> assertThat(audit.details()).isEqualTo("分页测试"));
    }

    @Test
    void pagesOnlySettledRewardsAndManagedRedemptionCodes() {
        Instant rewardedAt = Instant.parse("2026-07-21T02:00:00Z");
        jdbc.update(
                "INSERT INTO novel_reward_record(rewarder_user_id, author_id, book_id, amount, created_at) "
                        + "VALUES (9010, 2, 1, 17, ?)",
                Timestamp.from(rewardedAt));
        long rewardId = requiredLong("SELECT MAX(id) FROM novel_reward_record");
        jdbc.update(
                "INSERT INTO novel_token_ledger(user_id, change_amount, balance_after, transaction_type, reference_type, reference_id, created_at) "
                        + "VALUES (9010, -17, 100, 'BOOK_REWARD', 'REWARD', ?, ?)",
                Long.toString(rewardId),
                Timestamp.from(rewardedAt));

        AuthorRewardRepository.QueryResult rewardPage = rewards.findSuccessfulRewards(
                new AuthorRewardRepository.RewardFilter(2, 1L, null, null, 0, 1));
        assertThat(rewardPage.total()).isEqualTo(1);
        assertThat(rewardPage.totalTokens()).isEqualTo(17);
        assertThat(rewardPage.items()).extracting(AuthorRewardRecord::id).containsExactly(rewardId);

        WalletRepository.ManagedCodeQueryResult codePage = wallet.findManagedRedemptionCodes(
                new WalletRepository.ManagedCodeFilter(null, "SYSTEM-DEMO", "TOKEN", "ACTIVE", 0, 1));
        assertThat(codePage.total()).isEqualTo(1);
        assertThat(codePage.items()).singleElement().satisfies(code -> assertThat(code.code()).isEqualTo("WELCOME100"));
    }

    private long requiredLong(String query) {
        Long value = jdbc.queryForObject(query, Long.class);
        if (value == null) {
            throw new AssertionError("expected generated id");
        }
        return value;
    }
}
