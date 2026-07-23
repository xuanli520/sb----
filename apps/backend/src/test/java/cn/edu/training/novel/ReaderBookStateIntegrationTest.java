package cn.edu.training.novel;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Ensures a reader page can resolve only its own book state without loading growing account lists. */
@SpringBootTest(properties = {
        "novel.internal-api-key=reader-book-state-test-internal-key",
        "novel.development-auth-enabled=false",
        "novel.scheduled-publication.enabled=false",
        "novel.auth.bcrypt-strength=4",
        "spring.datasource.url=jdbc:h2:mem:reader_book_state_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ReaderBookStateIntegrationTest {
    private static final String INTERNAL_KEY = "reader-book-state-test-internal-key";
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Autowired AuthService authService;
    @Autowired MockMvc mvc;

    @Test
    void resolvesOneBookshelfStateAndOneBookProgressForTheCurrentReader() throws Exception {
        AuthService.AuthenticatedSession reader = authService.register(
                "reader-book-state@example.test", "单书状态读者", PASSWORD);

        mvc.perform(account(get("/api/v1/account/bookshelf/1"), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(false));
        mvc.perform(account(get("/api/v1/account/books/1/progress"), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));

        mvc.perform(account(post("/api/v1/account/bookshelf/1"), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(true));
        mvc.perform(account(get("/api/v1/account/bookshelf/1"), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(true));
        mvc.perform(account(get("/api/v1/account/bookshelf/999999"), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.saved").value(false));

        mvc.perform(account(put("/api/v1/account/progress")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":1,\"chapterId\":1001,\"offset\":12}"), reader))
                .andExpect(status().isOk());
        mvc.perform(account(get("/api/v1/account/books/1/progress"), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bookId").value(1))
                .andExpect(jsonPath("$.data.chapterId").value(1001))
                .andExpect(jsonPath("$.data.offset").value(12));
        mvc.perform(account(get("/api/v1/account/books/2/progress"), reader))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder account(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            AuthService.AuthenticatedSession session) {
        return request
                .header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header("X-Novel-Bff-Session", session.bffSessionId());
    }
}
