package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Chapter;
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
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:catalog_persistence_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CatalogPersistenceIntegrationTest {
    @Autowired NovelStore store;
    @Autowired AuditTrail auditTrail;
    @Autowired WalletRepository walletRepository;
    @Autowired ReaderRepository readerRepository;
    @Autowired OperationsRepository operationsRepository;
    @Autowired AuthService authService;
    @Autowired ContentModerationService contentModerationService;
    @Autowired ContentModerationReviewService contentModerationReviewService;
    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void catalogWritesAreRetrievedAfterRepositoryAndServiceRecreation() {
        Book draft = store.createBook(2, "持久化测试书", "科幻", "验证作品目录不会只存在于进程内存。");
        Chapter chapter = store.addChapter(2, draft.id(), "第一章 持久化", "这段章节正文应该由数据库重新读取。", true);

        assertThat(draft.id()).isEqualTo(101L);
        assertThat(chapter.id()).isEqualTo(1004L);
        assertThat(jdbcTemplate.queryForObject("SELECT status FROM novel_book WHERE id = ?", String.class, draft.id()))
                .isEqualTo(BookStatus.PENDING_REVIEW.name());
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM novel_chapter WHERE book_id = ?", Integer.class, draft.id()))
                .isEqualTo(1);

        CatalogRepository reloadedRepository = new CatalogRepository(jdbcTemplate);
        NovelStore recreatedStore = new NovelStore(
                auditTrail,
                reloadedRepository,
                walletRepository,
                readerRepository,
                new InteractionRepository(jdbcTemplate),
                operationsRepository,
                authService,
                contentModerationService,
                contentModerationReviewService);
        Book reloadedBook = recreatedStore.book(draft.id());
        List<Chapter> reloadedChapters = reloadedRepository.findChaptersByBookId(draft.id());

        assertThat(reloadedBook.title()).isEqualTo("持久化测试书");
        assertThat(reloadedBook.status()).isEqualTo(BookStatus.PENDING_REVIEW);
        assertThat(reloadedChapters).containsExactly(chapter);

        recreatedStore.review(1L, draft.id(), true, "人工审核通过");

        assertThat(reloadedRepository.findPublished("持久化", "科幻", "连载中"))
                .extracting(Book::id)
                .contains(draft.id());
        assertThat(recreatedStore.publishedChapters(draft.id())).containsExactly(chapter);
        assertThat(new AuditTrail(jdbcTemplate).recent())
                .anyMatch(action -> action.contains("review book=" + draft.id()));
    }
}
