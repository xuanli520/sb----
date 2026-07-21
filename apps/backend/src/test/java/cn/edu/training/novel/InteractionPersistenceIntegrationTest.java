package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import cn.edu.training.novel.domain.Comment;
import cn.edu.training.novel.domain.InteractionStats;
import cn.edu.training.novel.service.AuditTrail;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.ContentModerationService;
import cn.edu.training.novel.service.ContentModerationReviewService;
import cn.edu.training.novel.service.InteractionRepository;
import cn.edu.training.novel.service.NovelStore;
import cn.edu.training.novel.service.OperationsRepository;
import cn.edu.training.novel.service.ReaderRepository;
import cn.edu.training.novel.service.WalletRepository;
import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.BookModerationSnapshotService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:interaction_persistence_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class InteractionPersistenceIntegrationTest {
    @Autowired NovelStore store;
    @Autowired AuditTrail auditTrail;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired OperationsRepository operationsRepository;
    @Autowired AuthService authService;
    @Autowired ContentModerationService contentModerationService;
    @Autowired ContentModerationReviewService contentModerationReviewService;
    @Autowired BookModerationSnapshotService bookModerationSnapshotService;

    @Test
    void commentsRatingsVotesAndDurableCountersSurviveFreshRepositoryAndServiceInstances() {
        Comment visible = store.comment(81L, "持久化读者", 1L, 1001L, "港口的线索很有意思");
        Comment pending = store.comment(81L, "持久化读者", 1L, null, "这里包含敏感词，需要审核");

        assertThat(store.rate(81L, 1L, 5)).isEqualTo(5.0);
        assertThat(store.rate(82L, 1L, 1)).isEqualTo(3.0);
        assertThat(store.rate(81L, 1L, 4)).isEqualTo(2.5);
        assertThat(store.vote(81L, 1L, "recommendation")).containsEntry("count", 1L);
        assertThat(store.vote(81L, 1L, "monthly")).containsEntry("count", 1L);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_comment", Long.class)).isEqualTo(2L);
        assertThat(jdbc.queryForObject(
                "SELECT rating_count FROM novel_book_interaction_stat WHERE book_id = 1", Long.class)).isEqualTo(2L);
        assertThat(jdbc.queryForObject(
                "SELECT rating_total FROM novel_book_interaction_stat WHERE book_id = 1", Long.class)).isEqualTo(5L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%rate book=1 user=81 value=4%'", Long.class)).isEqualTo(1L);

        InteractionRepository reloadedInteractions = new InteractionRepository(jdbc);
        NovelStore reloadedStore = new NovelStore(
                auditTrail,
                new CatalogRepository(jdbc),
                new WalletRepository(jdbc),
                new ReaderRepository(jdbc),
                reloadedInteractions,
                operationsRepository,
                authService,
                contentModerationService,
                contentModerationReviewService,
                bookModerationSnapshotService);

        assertThat(reloadedStore.comments(1L)).containsExactly(visible);
        assertThat(reloadedInteractions.findCommentsForUser(81L, "PENDING_REVIEW", 0, 20).items())
                .containsExactly(pending);
        assertThat(reloadedStore.interactionStats(1L)).isEqualTo(new InteractionStats(1L, 2L, 2.5, 1L, 1L));

        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        assertThatThrownBy(() -> transaction.executeWithoutResult(ignored -> reloadedStore.vote(81L, 1L, "recommendation")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("already voted for this book");
        transaction.executeWithoutResult(ignored -> reloadedStore.reviewComment(1L, pending.id(), true, "人工审核通过"));

        assertThat(reloadedStore.comments(1L)).extracting(Comment::id).containsExactly(visible.id(), pending.id());
        assertThat(reloadedStore.interactionStats(1L).visibleCommentCount()).isEqualTo(2L);
        assertThat(jdbc.queryForObject(
                "SELECT status FROM novel_comment WHERE id = ?", String.class, pending.id())).isEqualTo("VISIBLE");
    }

    @Test
    void ratingAndVoteUniqueKeysKeepRetriesFromInflatingCounters() {
        store.rate(91L, 1L, 2);
        store.rate(91L, 1L, 5);
        store.rate(92L, 1L, 3);
        store.vote(91L, 1L, "recommendation");

        assertThatThrownBy(() -> store.vote(91L, 1L, "recommendation"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("already voted for this book");
        assertThat(store.vote(91L, 1L, "monthly")).containsEntry("count", 1L);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_book_rating WHERE book_id = 1", Long.class))
                .isEqualTo(2L);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_book_vote WHERE book_id = 1 AND vote_type = 'recommendation'", Long.class))
                .isEqualTo(1L);
        assertThat(store.interactionStats(1L)).isEqualTo(new InteractionStats(0L, 2L, 4.0, 1L, 1L));
    }
}
