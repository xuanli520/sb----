package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.AuthorApplication;
import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookPresentation;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.NovelStore;
import java.util.EnumSet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:author_onboarding_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class AuthorOnboardingAndBookshelfIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired AuthService authService;
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired NovelStore store;

    @Test
    void approvalCreatesThePenNameProfileAndUsesItForTheApplicantWork() throws Exception {
        AuthService.AuthenticatedSession session = authService.register(
                "new.author@example.test",
                "真实申请人",
                "correct-horse-battery-staple");
        long userId = session.user().id();
        AuthorApplication application = store.applyAuthor(userId, "北辰", "计划持续创作长篇科幻作品。");

        mvc.perform(get("/api/v1/account/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(application.id()))
                .andExpect(jsonPath("$.data.status").value("PENDING"));

        mvc.perform(post("/api/v1/admin/author-applications/{id}", application.id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"材料完整，审核通过\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("APPROVED"))
                .andExpect(jsonPath("$.data.decidedByUserId").value(1));

        assertThat(jdbc.queryForObject(
                "SELECT pen_name FROM novel_author_profile WHERE user_id = ?",
                String.class,
                userId)).isEqualTo("北辰");
        assertThat(jdbc.queryForObject(
                "SELECT approved_application_id FROM novel_author_profile WHERE user_id = ?",
                Long.class,
                userId)).isEqualTo(application.id());
        assertThat(jdbc.queryForObject(
                "SELECT decided_by_user_id FROM novel_author_application WHERE id = ?",
                Long.class,
                application.id())).isEqualTo(1L);
        assertThat(authService.resolveBffSession(session.bffSessionId()).orElseThrow().roles()).contains(Role.AUTHOR);

        mvc.perform(get("/api/v1/account/author-applications")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.penName").value("北辰"))
                .andExpect(jsonPath("$.data.status").value("APPROVED"));

        mvc.perform(post("/api/v1/author/books")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"真实作者首作\",\"category\":\"科幻\",\"synopsis\":\"来自真实申请流程的作品。\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.author").value("北辰"))
                .andExpect(jsonPath("$.data.authorId").value(userId));
    }

    @Test
    void bookshelfOnlyAddsAndReturnsPublishedWorks() throws Exception {
        AuthService.AuthenticatedSession session = authService.register(
                "bookshelf.reader@example.test",
                "书架读者",
                "correct-horse-battery-staple");
        long userId = session.user().id();

        for (BookStatus unpublishedStatus : EnumSet.complementOf(EnumSet.of(BookStatus.PUBLISHED))) {
            jdbc.update("UPDATE novel_book SET status = ? WHERE id = ?", unpublishedStatus.name(), 1L);
            mvc.perform(post("/api/v1/account/bookshelf/1")
                            .header("X-Novel-Internal-Key", INTERNAL_KEY)
                            .header("X-Novel-Bff-Session", session.bffSessionId()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.msg").value("book not published"));
        }

        jdbc.update("UPDATE novel_book SET status = ? WHERE id = ?", BookStatus.PUBLISHED.name(), 1L);
        mvc.perform(post("/api/v1/account/bookshelf/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header("X-Novel-Bff-Session", session.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(true));

        Book staleDraft = store.createBook(2L, "未公开旧书架记录", "科幻", "此草稿不可暴露给读者。");
        jdbc.update(
                "INSERT INTO novel_reader_bookshelf(user_id, book_id, added_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                userId,
                staleDraft.id());

        assertThat(store.shelf(userId)).containsExactly(1L);
        assertThat(store.shelfBooks(userId, 0, 12).items()).extracting(BookPresentation::id).containsExactly(1L);
        mvc.perform(get("/api/v1/account/bookshelf")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header("X-Novel-Bff-Session", session.bffSessionId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(1))
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.meta.page").value(0))
                .andExpect(jsonPath("$.data.meta.size").value(12));
    }

    @Test
    void oversizedAuthorReviewReasonIsRejectedWithoutChangingThePendingApplication() throws Exception {
        AuthService.AuthenticatedSession session = authService.register(
                "long.author.review@example.test",
                "超长意见申请人",
                "correct-horse-battery-staple");
        AuthorApplication application = store.applyAuthor(session.user().id(), "长评笔名", "等待审核的申请材料。");

        mvc.perform(post("/api/v1/admin/author-applications/{id}", application.id())
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"" + "x".repeat(1025) + "\"}"))
                .andExpect(status().isBadRequest());

        assertThat(jdbc.queryForObject(
                "SELECT status FROM novel_author_application WHERE id = ?",
                String.class,
                application.id())).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject(
                "SELECT decided_by_user_id FROM novel_author_application WHERE id = ?",
                Long.class,
                application.id())).isNull();
    }
}
