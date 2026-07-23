package cn.edu.training.novel;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AuthService;
import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Covers MyBatis-Plus pages on every book-list surface with real opaque BFF sessions. */
@SpringBootTest(properties = {
        "novel.internal-api-key=book-page-test-internal-key",
        "novel.development-auth-enabled=false",
        "novel.scheduled-publication.enabled=false",
        "novel.auth.bcrypt-strength=4",
        "spring.datasource.url=jdbc:h2:mem:book_pages_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class BookListPaginationIntegrationTest {
    private static final String INTERNAL_KEY = "book-page-test-internal-key";
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Autowired AuthService authService;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;

    @Test
    void pagesBookshelfAuthorReviewsAndAvailabilityWithoutLoadingTheWholeList() throws Exception {
        AuthService.AuthenticatedSession reader = authService.register(
                "book-page-reader@example.test", "分页读者", PASSWORD);
        AuthService.AuthenticatedSession author = authService.register(
                "book-page-author@example.test", "分页作者", PASSWORD);
        AuthService.AuthenticatedSession administrator = authService.register(
                "book-page-admin@example.test", "分页站长", PASSWORD);
        authService.grantRole(author.user().id(), Role.AUTHOR);
        authService.grantRole(administrator.user().id(), Role.ADMIN);

        jdbc.update("UPDATE novel_book SET author_id = ?, status = ? WHERE id = 1",
                author.user().id(), BookStatus.PUBLISHED.name());
        jdbc.update("UPDATE novel_book SET author_id = ?, status = ? WHERE id = 2",
                author.user().id(), BookStatus.OFFLINE.name());
        jdbc.update("UPDATE novel_book SET status = ? WHERE id = 3", BookStatus.PUBLISHED.name());
        insertBook(2_001L, author.user().id(), BookStatus.PENDING_REVIEW);
        insertBook(2_002L, author.user().id(), BookStatus.PENDING_REVIEW);
        insertBook(2_003L, author.user().id(), BookStatus.NEEDS_REVIEW);

        mvc.perform(post("/api/v1/account/bookshelf/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/account/bookshelf/3")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk());
        jdbc.update("UPDATE novel_reader_bookshelf SET added_at = ? WHERE user_id = ? AND book_id = 1",
                Timestamp.from(Instant.now().minusSeconds(60)), reader.user().id());

        mvc.perform(get("/api/v1/account/bookshelf")
                        .param("page", "1")
                        .param("size", "1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", reader.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(1))
                .andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(1));

        mvc.perform(get("/api/v1/author/books")
                        .param("page", "1")
                        .param("size", "2")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", author.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(2_001))
                .andExpect(jsonPath("$.data.meta.total").value(5))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(2));

        mvc.perform(get("/api/v1/admin/reviews")
                        .param("page", "1")
                        .param("size", "1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", administrator.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(2_002))
                .andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(1));

        mvc.perform(get("/api/v1/admin/books")
                        .param("page", "1")
                        .param("size", "2")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", administrator.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(1))
                .andExpect(jsonPath("$.data.meta.total").value(3))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(2));
    }

    @Test
    void pagesStatusAuditsAndFiltersTheModerationQueueBeforeCounting() throws Exception {
        AuthService.AuthenticatedSession author = authService.register(
                "queue-page-author@example.test", "队列作者", PASSWORD);
        AuthService.AuthenticatedSession administrator = authService.register(
                "queue-page-admin@example.test", "队列站长", PASSWORD);
        authService.grantRole(author.user().id(), Role.AUTHOR);
        authService.grantRole(administrator.user().id(), Role.ADMIN);

        Instant now = Instant.now();
        insertBook(3_001L, author.user().id(), BookStatus.PENDING_REVIEW);
        insertBook(3_002L, author.user().id(), BookStatus.NEEDS_REVIEW);
        insertBook(3_003L, author.user().id(), BookStatus.PENDING_REVIEW);
        jdbc.update("UPDATE novel_book SET updated_at = ? WHERE id = 3001", Timestamp.from(now.minusSeconds(180)));
        jdbc.update("UPDATE novel_book SET updated_at = ? WHERE id = 3002", Timestamp.from(now.minusSeconds(120)));
        jdbc.update("UPDATE novel_book SET updated_at = ? WHERE id = 3003", Timestamp.from(now.minusSeconds(60)));
        jdbc.update(
                "INSERT INTO novel_chapter_candidate(book_id, target_chapter_id, volume_id, candidate_type, title, content, "
                        + "order_no, status, review_reason, moderation_audit_id, created_by_user_id, created_at, reviewed_by_user_id, reviewed_at) "
                        + "VALUES (1, 1001, NULL, 'NEW_CHAPTER', '候选新章', '候选章节正文', 2, 'PENDING_REVIEW', '', NULL, ?, ?, NULL, NULL)",
                author.user().id(),
                Timestamp.from(now));
        jdbc.update(
                "INSERT INTO novel_book_status_audit(book_id, action, previous_status, status, reason, operator_user_id, created_at) "
                        + "VALUES (1, 'TAKEDOWN', 'PUBLISHED', 'OFFLINE', '首次处置', ?, ?)",
                administrator.user().id(),
                Timestamp.from(now.minusSeconds(60)));
        jdbc.update(
                "INSERT INTO novel_book_status_audit(book_id, action, previous_status, status, reason, operator_user_id, created_at) "
                        + "VALUES (1, 'RESTORE_FOR_REVIEW', 'OFFLINE', 'PENDING_REVIEW', '再次复核', ?, ?)",
                administrator.user().id(),
                Timestamp.from(now));

        mvc.perform(get("/api/v1/admin/reviews/queue")
                        .param("scope", "WHOLE_BOOK")
                        .param("page", "1")
                        .param("size", "1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", administrator.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].scope").value("WHOLE_BOOK"))
                .andExpect(jsonPath("$.data.items[0].book.id").value(3_002))
                .andExpect(jsonPath("$.data.meta.total").value(3))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(1));

        mvc.perform(get("/api/v1/admin/reviews/queue")
                        .param("scope", "NEW_CHAPTER")
                        .param("page", "0")
                        .param("size", "1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", administrator.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].scope").value("NEW_CHAPTER"))
                .andExpect(jsonPath("$.data.items[0].book.id").value(1))
                .andExpect(jsonPath("$.data.items[0].candidate.id").isNumber())
                .andExpect(jsonPath("$.data.meta.total").value(1));

        mvc.perform(get("/api/v1/admin/books/1/status-audits")
                        .param("page", "1")
                        .param("size", "1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", administrator.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].action").value("TAKEDOWN"))
                .andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.meta.page").value(1))
                .andExpect(jsonPath("$.data.meta.size").value(1));
    }

    private void insertBook(long id, long authorId, BookStatus status) {
        jdbc.update(
                "INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, "
                        + "status, author_id, heat, purchase_price, created_at, updated_at) "
                        + "VALUES (?, ?, '分页作者', '科幻', 1000, '连载中', '分页测试作品', '#123456', ?, ?, 0, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                id,
                "分页测试作品" + id,
                status.name(),
                authorId);
    }
}
