package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.service.CoverImage;
import cn.edu.training.novel.service.CoverObjectStorage;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.NovelStore;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.mock.web.MockMultipartFile;

@SpringBootTest(classes = {
        NovelPlatformApplication.class,
        CoverUploadIntegrationTest.FakeCoverStorageConfiguration.class
}, properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.development-auth-enabled=true",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:cover_upload_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@AutoConfigureMockMvc
class CoverUploadIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired CatalogRepository catalogRepository;
    @Autowired FakeCoverObjectStorage coverStorage;

    @Test
    void authorUploadsValidatedBytesAndOnlyManagedFormerCoverIsRemovedAfterCommit() throws Exception {
        Book draft = store.createBook(2L, "Cover draft", "科幻", "cover test");

        String firstCover = upload(draft.id(), imageFile("suspicious-name.txt", "png", "text/plain"));
        assertThat(firstCover).matches("/media/covers/[0-9a-f-]{36}\\.png");
        assertThat(coverStorage.uploaded).containsKey(firstCover);
        assertThat(coverStorage.uploaded.get(firstCover).contentType()).isEqualTo("image/png");
        assertThat(coverStorage.deleted).doesNotContain("#563d7c");

        String secondCover = upload(draft.id(), imageFile("ignored.jpg", "jpeg", "application/octet-stream"));
        assertThat(secondCover).matches("/media/covers/[0-9a-f-]{36}\\.jpg");
        assertThat(coverStorage.deleted).containsExactly(firstCover);
        assertThat(store.book(draft.id()).cover()).isEqualTo(secondCover);

        Book externalCover = withCover(store.book(draft.id()), "https://files.example.invalid/not-managed.png");
        catalogRepository.updateBook(externalCover);
        String thirdCover = upload(draft.id(), imageFile("no-trust.png", "png", "image/png"));
        assertThat(thirdCover).isNotEqualTo(secondCover);
        assertThat(coverStorage.deleted).doesNotContain("https://files.example.invalid/not-managed.png");
    }

    @Test
    void authorEndpointRejectsInvalidActualBytesAndProtectedOrPublishedBooks() throws Exception {
        Book draft = store.createBook(2L, "Invalid cover draft", "科幻", "cover test");
        MockMultipartFile invalid = new MockMultipartFile("file", "cover.png", "image/png", "not actually an image".getBytes());

        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/cover", draft.id()).file(invalid), "author"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msg").value("cover image must be PNG or JPEG data"));
        assertThat(coverStorage.uploaded).isEmpty();

        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/cover", draft.id()).file(imageFile("cover.png", "png", "image/png")), "reader"))
                .andExpect(status().isForbidden());
        mvc.perform(author(multipart("/api/v1/author/books/1/cover").file(imageFile("cover.png", "png", "image/png")), "author"))
                .andExpect(status().isConflict());
        assertThat(coverStorage.uploaded).isEmpty();
    }

    private String upload(long bookId, MultipartFile file) throws Exception {
        String response = mvc.perform(author(multipart("/api/v1/author/books/{bookId}/cover", bookId).file((MockMultipartFile) file), "author"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cover").isString())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(response, "$.data.cover");
    }

    private static MockMultipartHttpServletRequestBuilder author(MockMultipartHttpServletRequestBuilder request, String principal) {
        return request.header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header("X-Novel-Development-Principal", principal);
    }

    private static MockMultipartFile imageFile(String filename, String format, String declaredMime) throws Exception {
        BufferedImage image = new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0x224466);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, output)).isTrue();
        return new MockMultipartFile("file", filename, declaredMime, output.toByteArray());
    }

    private static Book withCover(Book book, String cover) {
        return new Book(book.id(), book.title(), book.author(), book.category(), book.words(), book.serialStatus(),
                book.synopsis(), cover, book.status(), book.authorId(), book.heat(), book.purchasePrice());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeCoverStorageConfiguration {
        @Bean
        @Primary
        FakeCoverObjectStorage fakeCoverObjectStorage() { return new FakeCoverObjectStorage(); }
    }

    static final class FakeCoverObjectStorage implements CoverObjectStorage {
        final Map<String, CoverImage> uploaded = new LinkedHashMap<>();
        final List<String> deleted = new ArrayList<>();

        @Override
        public StoredCover store(CoverImage image) {
            String url = "/media/covers/" + UUID.randomUUID() + "." + image.extension();
            uploaded.put(url, image);
            return new StoredCover(url, url.substring("/media/".length()));
        }

        @Override
        public void deleteManaged(String publicUrl) {
            if (!isManaged(publicUrl)) throw new AssertionError("attempted to delete unmanaged URL " + publicUrl);
            deleted.add(publicUrl);
            uploaded.remove(publicUrl);
        }

        @Override public boolean isManaged(String publicUrl) { return uploaded.containsKey(publicUrl) || deleted.contains(publicUrl); }
    }
}
