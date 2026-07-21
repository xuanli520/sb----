package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
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

/** Exercises the FR-04 selection anchor, visibility, ownership, and review boundaries end to end. */
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "spring.datasource.url=jdbc:h2:mem:paragraph_annotation_api_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ParagraphAnnotationApiIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";
    private static final String DEVELOPMENT_PRINCIPAL = "X-Novel-Development-Principal";

    @Autowired WebApplicationContext context;
    @Autowired JdbcTemplate jdbc;
    private MockMvc mvc;

    @BeforeEach
    void configureMvc() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .defaultRequest(get("/")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(DEVELOPMENT_PRINCIPAL, "reader"))
                .build();
    }

    @Test
    void privateHighlightStaysWithItsOwnerWhileRequestedShareMovesThroughAuditedReview() throws Exception {
        long privateId = createAnnotation(0, 0, 3, "雨落在", "只给自己看的线索", false);
        long pendingId = createAnnotation(0, 3, 5, "旧港", "像潮汐一样的开场", true);

        mvc.perform(get("/api/v1/public/books/1/chapters/1001/annotations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(get("/api/v1/account/annotations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(2))
                .andExpect(jsonPath("$.data.items[0].id").value(pendingId));
        mvc.perform(get("/api/v1/account/annotations")
                        .header(DEVELOPMENT_PRINCIPAL, "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));

        mvc.perform(get("/api/v1/author/books/1/annotations")
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .param("status", "PENDING_REVIEW"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(pendingId));
        mvc.perform(get("/api/v1/author/books/1/annotations")
                        .header(DEVELOPMENT_PRINCIPAL, "author")
                        .param("status", "PRIVATE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(get("/api/v1/admin/annotations")
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .param("status", "PRIVATE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(get("/api/v1/author/books/2/annotations")
                        .header(DEVELOPMENT_PRINCIPAL, "author"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/admin/annotations").param("status", "PENDING_REVIEW"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/admin/annotations/{annotationId}/review", pendingId)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"内容符合社区规范\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("VISIBLE"));
        mvc.perform(post("/api/v1/admin/annotations/{annotationId}/review", pendingId)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":true,\"reason\":\"重复审核\"}"))
                .andExpect(status().isConflict());

        mvc.perform(get("/api/v1/public/books/1/chapters/1001/annotations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(pendingId))
                .andExpect(jsonPath("$.data.items[0].selectedText").value("旧港"))
                .andExpect(jsonPath("$.data.items[0].note").value("像潮汐一样的开场"))
                .andExpect(jsonPath("$.data.items[0].userId").doesNotExist())
                .andExpect(jsonPath("$.data.items[0].status").doesNotExist());
        mvc.perform(get("/api/v1/account/annotations").param("status", "PRIVATE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(privateId));

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_audit_event WHERE action LIKE '%paragraph annotation=" + pendingId + "%state=VISIBLE%'",
                Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT reviewed_by_user_id FROM novel_paragraph_annotation WHERE id = ?",
                Long.class,
                pendingId)).isEqualTo(1L);
    }

    @Test
    void rejectsForgedOrUnpublishedAnchorsAndHidesReaderRecordsWhenPublicationIsWithdrawn() throws Exception {
        mvc.perform(post("/api/v1/account/books/1/chapters/1001/annotations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paragraphIndex\":0,\"selectionStart\":0,\"selectionEnd\":3,\"selectedText\":\"伪造内容\",\"shareIntent\":false}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/account/books/1/chapters/1002/annotations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paragraphIndex\":0,\"selectionStart\":0,\"selectionEnd\":3,\"selectedText\":\"长安城\",\"shareIntent\":false}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/account/books/1/chapters/1001/annotations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paragraphIndex\":1,\"selectionStart\":0,\"selectionEnd\":3,\"selectedText\":\"雨落在\",\"shareIntent\":false}"))
                .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM novel_paragraph_annotation", Long.class)).isZero();

        createAnnotation(0, 0, 3, "雨落在", "", false);
        jdbc.update("UPDATE novel_book SET status = 'NEEDS_REVIEW' WHERE id = 1");

        mvc.perform(get("/api/v1/public/books/1/chapters/1001/annotations"))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/account/annotations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));
    }

    @Test
    void onlyAdminsCanRejectRequestedSharesAndRejectedItemsNeverBecomePublic() throws Exception {
        long pendingId = createAnnotation(0, 6, 8, "信使", "不适合公开", true);

        mvc.perform(post("/api/v1/admin/annotations/{annotationId}/review", pendingId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":false,\"reason\":\"不符合社区规范\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/annotations/{annotationId}/review", pendingId)
                        .header(DEVELOPMENT_PRINCIPAL, "admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"approve\":false,\"reason\":\"不符合社区规范\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REJECTED"));
        mvc.perform(get("/api/v1/public/books/1/chapters/1001/annotations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(0));
        mvc.perform(get("/api/v1/account/annotations").param("status", "REJECTED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(pendingId));
    }

    private long createAnnotation(
            int paragraphIndex,
            int selectionStart,
            int selectionEnd,
            String selectedText,
            String note,
            boolean shareIntent) throws Exception {
        String body = "{\"paragraphIndex\":" + paragraphIndex
                + ",\"selectionStart\":" + selectionStart
                + ",\"selectionEnd\":" + selectionEnd
                + ",\"selectedText\":\"" + selectedText
                + "\",\"note\":\"" + note
                + "\",\"shareIntent\":" + shareIntent + "}";
        String response = mvc.perform(post("/api/v1/account/books/1/chapters/1001/annotations")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return ((Number) JsonPath.read(response, "$.data.id")).longValue();
    }
}
