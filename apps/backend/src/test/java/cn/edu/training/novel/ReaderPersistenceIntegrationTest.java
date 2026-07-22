package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;

import cn.edu.training.novel.domain.Bookmark;
import cn.edu.training.novel.domain.ReadingPreference;
import cn.edu.training.novel.domain.ReadingProgress;
import cn.edu.training.novel.service.AuditTrail;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.CommercialRuleService;
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

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:reader_persistence_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ReaderPersistenceIntegrationTest {
    @Autowired NovelStore store;
    @Autowired AuditTrail auditTrail;
    @Autowired CommercialRuleService commercialRuleService;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired OperationsRepository operationsRepository;
    @Autowired AuthService authService;
    @Autowired ContentModerationService contentModerationService;
    @Autowired ContentModerationReviewService contentModerationReviewService;
    @Autowired BookModerationSnapshotService bookModerationSnapshotService;

    @Test
    void readerStateSurvivesFreshRepositoryAndServiceLookup() {
        long readerId = 81L;
        ReadingPreference preference = new ReadingPreference("night", "sans", 22, 205, 70, "cover");

        assertThat(store.toggleShelf(readerId, 1L)).isTrue();
        assertThat(store.checkin(readerId)).isEqualTo(10);
        assertThat(store.savePreference(readerId, preference)).isEqualTo(preference);
        store.saveProgress(readerId, 1L, 1001L, 48);
        Bookmark bookmark = store.bookmark(readerId, 1L, 1001L, 48, "港口的徽章");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_reader_bookshelf WHERE user_id = ? AND book_id = ?",
                Integer.class,
                readerId,
                1L)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT points FROM novel_reader_point_balance WHERE user_id = ?",
                Long.class,
                readerId)).isEqualTo(10L);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_reader_bookmark WHERE user_id = ?",
                Integer.class,
                readerId)).isEqualTo(1);

        ReaderRepository reloadedReaderRepository = new ReaderRepository(jdbcTemplate);
        NovelStore reloadedStore = new NovelStore(
                auditTrail,
                new CatalogRepository(jdbcTemplate),
                new WalletRepository(jdbcTemplate),
                commercialRuleService,
                reloadedReaderRepository,
                new InteractionRepository(jdbcTemplate),
                operationsRepository,
                authService,
                contentModerationService,
                contentModerationReviewService,
                bookModerationSnapshotService);

        assertThat(reloadedStore.shelf(readerId)).containsExactly(1L);
        assertThat(reloadedStore.pointBalance(readerId)).isEqualTo(10);
        assertThat(reloadedStore.preference(readerId)).isEqualTo(preference);
        assertThat(reloadedStore.progress(readerId))
                .extracting(ReadingProgress::bookId, ReadingProgress::chapterId, ReadingProgress::offset)
                .containsExactly(tuple(1L, 1001L, 48));
        assertThat(reloadedStore.bookmarks(readerId, 1L))
                .extracting(Bookmark::id, Bookmark::bookId, Bookmark::chapterId, Bookmark::offset, Bookmark::note)
                .containsExactly(tuple(bookmark.id(), 1L, 1001L, 48, "港口的徽章"));
    }

    @Test
    void checkinAwardsPointsOnlyOncePerUserPerShanghaiBusinessDay() {
        long readerId = 82L;

        assertThat(store.checkin(readerId)).isEqualTo(10);
        assertThatThrownBy(() -> store.checkin(readerId))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("already checked in today");

        assertThat(store.pointBalance(readerId)).isEqualTo(10);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_reader_daily_checkin WHERE user_id = ?",
                Integer.class,
                readerId)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT points FROM novel_reader_point_balance WHERE user_id = ?",
                Long.class,
                readerId)).isEqualTo(10L);
    }

    @Test
    void bookmarksAreScopedToTheirOwnerAndRejectAChapterFromAnotherBook() {
        long ownerId = 83L;
        long otherReaderId = 84L;
        Bookmark bookmark = store.bookmark(ownerId, 1L, 1001L, 7, "只属于当前读者");

        assertThat(store.bookmarks(otherReaderId, 1L)).isEmpty();
        assertThat(new ReaderRepository(jdbcTemplate).bookmarkByIdForUser(bookmark.id(), otherReaderId)).isEmpty();
        assertThat(store.bookmarks(ownerId, 1L)).containsExactly(bookmark);
        assertThatThrownBy(() -> store.bookmark(ownerId, 1L, 1002L, 9, "跨书章节"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("chapter is not published for this book");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM novel_reader_bookmark WHERE user_id = ? AND book_id = ?",
                Integer.class,
                ownerId,
                1L)).isEqualTo(1);
    }
}
