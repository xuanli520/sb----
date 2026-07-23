package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.EditorialRecommendation;
import cn.edu.training.novel.service.EditorialOperationsService;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;

/** Covers the FR-10 recommendation and hot-search operator path, including rank contention. */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:editorial_operations_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class EditorialOperationsIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired EditorialOperationsService editorialOperationsService;

    @Test
    void administratorCanAssignReorderRemoveAndAuditOnlyPublishedRecommendations() throws Exception {
        insertBook(40L, "运营精选", "PUBLISHED");
        insertBook(41L, "未发布作品", "DRAFT");

        mvc.perform(get("/api/v1/admin/editorial/recommendations")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());

        mvc.perform(post("/api/v1/admin/editorial/recommendations")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":40,\"rank\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.book.id").value(40))
                .andExpect(jsonPath("$.data.rank").value(2));

        mvc.perform(get("/api/v1/admin/editorial/recommendations")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(4))
                .andExpect(jsonPath("$.data[0].book.id").value(1))
                .andExpect(jsonPath("$.data[1].book.id").value(40))
                .andExpect(jsonPath("$.data[2].book.id").value(3))
                .andExpect(jsonPath("$.data[3].book.id").value(2));

        mvc.perform(post("/api/v1/admin/editorial/recommendations")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":41}"))
                .andExpect(status().isConflict());

        mvc.perform(put("/api/v1/admin/editorial/recommendations/{bookId}", 1L)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rank\":99}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/admin/editorial/recommendations/{bookId}", 40L)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rank\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rank").value(1));

        mvc.perform(delete("/api/v1/admin/editorial/recommendations/{bookId}", 3L)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/admin/editorial/recommendations/audits")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].action").value("REMOVED"))
                .andExpect(jsonPath("$.data[1].action").value("REORDERED"))
                .andExpect(jsonPath("$.data[2].action").value("ASSIGNED"))
                .andExpect(jsonPath("$.data[2].operatorUserId").value(1));

        jdbc.update("UPDATE novel_book SET status = 'DRAFT' WHERE id = 40");
        mvc.perform(get("/api/v1/public/recommendations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].id").value(1))
                .andExpect(jsonPath("$.data[1].id").value(2));
        mvc.perform(get("/api/v1/public/home"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.recommendations[0].id").value(1))
                .andExpect(jsonPath("$.data.recommendations[1].id").value(2));
    }

    @Test
    void hotSearchLifecycleIsAuditedAndPublicReadsOnlyEnabledTerms() throws Exception {
        mvc.perform(get("/api/v1/admin/hot-searches")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.READER))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/public/hot-searches"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[0].term").value("星海"));

        String creation = mvc.perform(post("/api/v1/admin/hot-searches")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\"月色\",\"enabled\":true,\"rank\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.term").value("月色"))
                .andExpect(jsonPath("$.data.rank").value(1))
                .andReturn().getResponse().getContentAsString();
        Object termIdValue = com.jayway.jsonpath.JsonPath.read(creation, "$.data.id");
        long termId = ((Number) termIdValue).longValue();

        mvc.perform(get("/api/v1/public/hot-searches"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].term").value("月色"));
        mvc.perform(get("/api/v1/public/home"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.hotSearchTerms[0].term").value("月色"));

        mvc.perform(put("/api/v1/admin/hot-searches/{termId}", termId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\"月色\",\"enabled\":false,\"rank\":2}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.data.rank").value(2));
        mvc.perform(get("/api/v1/public/hot-searches"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[*].term").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("月色"))));

        mvc.perform(post("/api/v1/admin/hot-searches")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"term\":\" 星海 \",\"enabled\":true}"))
                .andExpect(status().isConflict());

        mvc.perform(delete("/api/v1/admin/hot-searches/{termId}", termId)
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/admin/hot-searches/audits")
                        .header("X-Novel-Internal-Key", INTERNAL_KEY)
                        .header(TestBffSessions.HEADER, TestBffSessions.ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].action").value("REMOVED"))
                .andExpect(jsonPath("$.data[1].action").value("UPDATED"))
                .andExpect(jsonPath("$.data[2].action").value("CREATED"));
    }

    @Test
    void concurrentAssignmentsToTheSamePositionProduceOneDenseUniqueOrder() throws Exception {
        insertBook(50L, "并发精选一", "PUBLISHED");
        insertBook(51L, "并发精选二", "PUBLISHED");
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<EditorialRecommendation>> results = new ArrayList<>();
            results.add(workers.submit(() -> assignWhenReleased(50L, ready, start)));
            results.add(workers.submit(() -> assignWhenReleased(51L, ready, start)));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            for (Future<EditorialRecommendation> result : results) {
                assertThat(result.get(10, TimeUnit.SECONDS).rank()).isEqualTo(1);
            }
        } finally {
            start.countDown();
            workers.shutdownNow();
            assertThat(workers.awaitTermination(5, TimeUnit.SECONDS)).isTrue();
        }

        List<Integer> ranks = jdbc.queryForList(
                "SELECT editorial_rank FROM novel_book WHERE editorial_rank IS NOT NULL ORDER BY editorial_rank ASC",
                Integer.class);
        assertThat(ranks).containsExactly(1, 2, 3, 4, 5);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(DISTINCT editorial_rank) FROM novel_book WHERE editorial_rank IS NOT NULL",
                Integer.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_editorial_recommendation_audit WHERE action = 'ASSIGNED'",
                Integer.class)).isEqualTo(2);
    }

    private EditorialRecommendation assignWhenReleased(long bookId, CountDownLatch ready, CountDownLatch start) {
        ready.countDown();
        try {
            if (!start.await(5, TimeUnit.SECONDS)) {
                throw new AssertionError("concurrent assignments did not start");
            }
            return editorialOperationsService.assignRecommendation(1L, bookId, 1);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new AssertionError("concurrent assignment was interrupted", exception);
        }
    }

    private void insertBook(long id, String title, String status) {
        jdbc.update(
                "INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, "
                        + "status, author_id, heat, purchase_price, created_at, updated_at) "
                        + "VALUES (?, ?, '运营作者', '科幻', 1000, '连载中', '用于运营测试的作品', '#111111', ?, 1, 1, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                id,
                title,
                status);
    }
}
