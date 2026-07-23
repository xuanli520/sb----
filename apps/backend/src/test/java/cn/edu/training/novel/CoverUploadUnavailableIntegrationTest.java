package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockMultipartFile;
import cn.edu.training.novel.service.NovelStore;

/** Normal test/runtime configuration must not require a reachable MinIO server. */
@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.cover-storage.enabled=false",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:cover_unavailable_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@AutoConfigureMockMvc
class CoverUploadUnavailableIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired NovelStore store;

    @Test
    void disabledStorageFailsClosedWithAReadableServiceUnavailableResponse() throws Exception {
        long bookId = store.createBook(2L, "Unavailable cover draft", "科幻", "cover storage disabled").id();
        mvc.perform(multipart("/api/v1/author/books/{bookId}/cover", bookId)
                        .file(imageFile())
                        .header("X-Novel-Internal-Key", "local-novel-internal-key")
                        .header(TestBffSessions.HEADER, TestBffSessions.AUTHOR))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value(503))
                .andExpect(jsonPath("$.msg").value("cover upload storage is disabled"));
    }

    private static MockMultipartFile imageFile() throws Exception {
        BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, "png", output)).isTrue();
        return new MockMultipartFile("file", "cover.png", "image/png", output.toByteArray());
    }
}
