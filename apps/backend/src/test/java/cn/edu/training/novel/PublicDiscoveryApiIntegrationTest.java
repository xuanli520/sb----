package cn.edu.training.novel;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "spring.datasource.url=jdbc:h2:mem:public_discovery_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class PublicDiscoveryApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void publicCatalogCombinesLiteralFuzzySearchAndAllDiscoveryFilters() throws Exception {
        mvc.perform(get("/api/v1/public/books")
                        .param("q", "旧港")
                        .param("category", "科幻")
                        .param("status", "连载中")
                        .param("minWords", "200000")
                        .param("maxWords", "300000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(1))
                .andExpect(jsonPath("$.data.meta.total").value(1))
                .andExpect(jsonPath("$.data.meta.facets.categories[0]").value("古言"))
                .andExpect(jsonPath("$.data.meta.facets.wordCountRanges[1].minWords").value(100000));

        mvc.perform(get("/api/v1/public/books").param("q", "林墨"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].title").value("星海拾光"));

        mvc.perform(get("/api/v1/public/books").param("type", "悬疑"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(2));

        // Wildcards and SQL punctuation are part of the reader's literal keyword, not query syntax.
        mvc.perform(get("/api/v1/public/books").param("q", "%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(0));
        mvc.perform(get("/api/v1/public/books").param("q", "%' OR '1'='1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(0));
    }

    @Test
    void homeSeparatesPersistedEditorialPlacementFromStableHotRanking() throws Exception {
        mvc.perform(get("/api/v1/public/home"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.carousel[0].id").value(1))
                .andExpect(jsonPath("$.data.carousel[1].id").value(3))
                .andExpect(jsonPath("$.data.hot[0].id").value(1))
                .andExpect(jsonPath("$.data.hot[1].id").value(2));

        jdbc.update("UPDATE novel_book SET heat = ? WHERE id IN (?, ?)", 12_000L, 1L, 2L);
        mvc.perform(get("/api/v1/public/hot").param("limit", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].id").value(1))
                .andExpect(jsonPath("$.data[1].id").value(2));
    }

    @Test
    void publicDiscoveryNeverLeaksAWorkThatIsNoLongerPublished() throws Exception {
        jdbc.update("UPDATE novel_book SET status = 'DRAFT' WHERE id = ?", 1L);

        mvc.perform(get("/api/v1/public/books").param("q", "星海"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items.length()").value(0));
        mvc.perform(get("/api/v1/public/home"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.carousel[0].id").value(3))
                .andExpect(jsonPath("$.data.hot[0].id").value(2));
    }
}
