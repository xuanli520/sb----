package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.BookStatusAudit;
import cn.edu.training.novel.service.BookModerationSnapshotService;
import cn.edu.training.novel.service.NovelStore;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "novel.runtime-mode=TEST",
        "novel.audit.moderation.development-simulation-enabled=true",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:book_takedown_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class BookTakedownIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";
    private static final String DEVELOPMENT_PRINCIPAL = "X-Novel-Development-Principal";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired BookModerationSnapshotService snapshots;

    @Test
    void administratorCanTakeDownPublishedBookAndRestoreItOnlyThroughFreshFullWorkReview() throws Exception {
        mvc.perform(get("/api/v1/public/books/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.book.status").value("PUBLISHED"));

        mvc.perform(post("/api/v1/admin/books/1/takedown")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "reader")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"涉嫌侵权，待核验\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/admin/books/1/takedown")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"  \"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/v1/admin/books/1/takedown")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"涉嫌侵权，待核验\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OFFLINE"));

        assertThat(store.book(1L).status()).isEqualTo(BookStatus.OFFLINE);
        mvc.perform(get("/api/v1/public/books"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[?(@.id == 1)]").isEmpty());
        mvc.perform(get("/api/v1/public/books/1")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/author/books")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header(DEVELOPMENT_PRINCIPAL, "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].id").value(1))
                .andExpect(jsonPath("$.data.items[0].status").value("OFFLINE"))
                .andExpect(jsonPath("$.data.meta.total").value(1));
        mvc.perform(get("/api/v1/author/books/1/status-audits")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header(DEVELOPMENT_PRINCIPAL, "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].action").value("TAKEDOWN"))
                .andExpect(jsonPath("$.data.items[0].reason").value("涉嫌侵权，待核验"))
                .andExpect(jsonPath("$.data.meta.total").value(1));
        mvc.perform(get("/api/v1/author/books/2/status-audits")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/author/books/1/submit")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/author/books/1/chapters")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"不得绕过下线\",\"content\":\"下线状态不允许作者提交内容\",\"submit\":true}"))
                .andExpect(status().isConflict());
        assertThat(store.book(1L).status()).isEqualTo(BookStatus.OFFLINE);

        mvc.perform(post("/api/v1/admin/books/1/takedown")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"重复下线不应成立\"}"))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/v1/admin/books/1/restore")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "reader")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"读者无权恢复\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/admin/books/1/restore")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"申诉材料已补齐，重新进行整书审核\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PENDING_REVIEW"));

        assertThat(store.book(1L).status()).isEqualTo(BookStatus.PENDING_REVIEW);
        assertThat(store.moderationSnapshots(1L, 10)).singleElement()
                .satisfies(snapshot -> assertThat(snapshot.current()).isTrue());
        mvc.perform(get("/api/v1/public/books/1")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/admin/reviews")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header(DEVELOPMENT_PRINCIPAL, "admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[?(@.id == 1)].status").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.data.meta.total").value(1));

        List<BookStatusAudit> audits = store.bookStatusAudits(1L, 0, 10).items();
        assertThat(audits).extracting(BookStatusAudit::action)
                .containsExactly("RESTORE_FOR_REVIEW", "TAKEDOWN");
        assertThat(audits.getFirst())
                .extracting(BookStatusAudit::previousStatus, BookStatusAudit::status, BookStatusAudit::reason, BookStatusAudit::operatorUserId)
                .containsExactly(BookStatus.OFFLINE, BookStatus.PENDING_REVIEW, "申诉材料已补齐，重新进行整书审核", 1L);

        mvc.perform(post("/api/v1/admin/books/1/restore")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"重复恢复不应成立\"}"))
                .andExpect(status().isConflict());

        assertThat(snapshots.processAvailableChunks()).isPositive();
        mvc.perform(post("/api/v1/admin/reviews/1")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"整书复核通过\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PUBLISHED"));
        mvc.perform(get("/api/v1/public/books/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.book.status").value("PUBLISHED"));
    }
}
