package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.CoverImage;
import cn.edu.training.novel.service.CoverObjectStorage;
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
import org.springframework.jdbc.core.JdbcTemplate;
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
        "novel.development-auth-enabled=false",
        "novel.auth.bcrypt-strength=4",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:cover_upload_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
@AutoConfigureMockMvc
class CoverUploadIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired AuthService authService;
    @Autowired JdbcTemplate jdbc;
    @Autowired FakeCoverObjectStorage coverStorage;

    @Test
    void authorUploadsValidatedBytesAndDefersFormerCoverCleanup() throws Exception {
        AuthService.AuthenticatedSession author = authorSession("cover.author@example.test");
        Book draft = store.createBook(author.user().id(), "Cover draft", "科幻", "cover test");

        String firstCover = upload(author, draft.id(), imageFile("suspicious-name.txt", "png", "text/plain"));
        assertThat(firstCover).matches("/media/covers/[0-9a-f-]{36}\\.png");
        assertThat(coverStorage.uploaded).containsKey(firstCover);
        assertThat(coverStorage.uploaded.get(firstCover).contentType()).isEqualTo("image/png");

        String secondCover = upload(author, draft.id(), imageFile("ignored.jpg", "jpeg", "application/octet-stream"));
        assertThat(secondCover).matches("/media/covers/[0-9a-f-]{36}\\.jpg");
        assertThat(coverStorage.deleted).isEmpty();
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_media_asset WHERE state = 'PENDING_DELETE' AND purpose = 'BOOK_COVER'",
                Integer.class)).isEqualTo(1);
        assertThat(store.book(draft.id()).cover()).isNull();
    }

    @Test
    void authorEndpointRejectsInvalidActualBytesAndProtectedOrPublishedBooks() throws Exception {
        AuthService.AuthenticatedSession author = authorSession("invalid.cover.author@example.test");
        AuthService.AuthenticatedSession reader = authService.register(
                "invalid.cover.reader@example.test", "普通读者", "correct-horse-battery-staple");
        Book draft = store.createBook(author.user().id(), "Invalid cover draft", "科幻", "cover test");
        MockMultipartFile invalid = new MockMultipartFile("file", "cover.png", "image/png", "not actually an image".getBytes());

        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/cover", draft.id()).file(invalid), author))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msg").value("cover image must be PNG or JPEG data"));
        assertThat(coverStorage.uploaded).isEmpty();

        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/cover", draft.id()).file(imageFile("cover.png", "png", "image/png")), reader))
                .andExpect(status().isForbidden());
        jdbc.update("UPDATE novel_book SET status = 'PUBLISHED' WHERE id = ?", draft.id());
        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/cover", draft.id()).file(imageFile("cover.png", "png", "image/png")), author))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.book.cover").doesNotExist())
                .andExpect(jsonPath("$.data.candidate.status").value("PENDING_REVIEW"));
    }

    private String upload(AuthService.AuthenticatedSession author, long bookId, MultipartFile file) throws Exception {
        String response = mvc.perform(author(multipart("/api/v1/author/books/{bookId}/cover", bookId).file((MockMultipartFile) file), author))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.book.cover").isString())
                .andExpect(jsonPath("$.data.candidate").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(response, "$.data.book.cover");
    }

    private static MockMultipartHttpServletRequestBuilder author(
            MockMultipartHttpServletRequestBuilder request,
            AuthService.AuthenticatedSession session) {
        return request.header("X-Novel-Internal-Key", INTERNAL_KEY)
                .header("X-Novel-Bff-Session", session.bffSessionId());
    }

    private static MockMultipartFile imageFile(String filename, String format, String declaredMime) throws Exception {
        BufferedImage image = new BufferedImage(3, 2, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0x224466);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, output)).isTrue();
        return new MockMultipartFile("file", filename, declaredMime, output.toByteArray());
    }

    private AuthService.AuthenticatedSession authorSession(String username) {
        AuthService.AuthenticatedSession session = authService.register(
                username, "封面作者", "correct-horse-battery-staple");
        var application = store.applyAuthor(session.user().id(), "封面笔名", "持续创作并维护作品封面。");
        store.decideAuthorApplication(1L, application.id(), true, "申请材料完整");
        return session;
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeCoverStorageConfiguration {
        @Bean
        @Primary
        FakeCoverObjectStorage fakeCoverObjectStorage() { return new FakeCoverObjectStorage(); }
    }

    static final class FakeCoverObjectStorage implements CoverObjectStorage {
        final Map<String, CoverImage> uploaded = new LinkedHashMap<>();
        final Map<String, CoverImage> staged = new LinkedHashMap<>();
        final List<String> deleted = new ArrayList<>();

        @Override
        public StoredCover store(CoverImage image) {
            String url = "/media/covers/" + UUID.randomUUID() + "." + image.extension();
            uploaded.put(url, image);
            return new StoredCover(url, url.substring("/media/".length()));
        }

        @Override
        public StoredStagedCover storeStagingCover(CoverImage image) {
            String objectKey = "staging/" + UUID.randomUUID() + "." + image.extension();
            staged.put(objectKey, image);
            return new StoredStagedCover(objectKey);
        }

        @Override
        public StoredCover promoteStagingCover(String objectKey) {
            CoverImage image = staged.get(objectKey);
            if (image == null) throw new AssertionError("missing staged object " + objectKey);
            return store(image);
        }

        @Override
        public void deleteManagedObject(String objectKey) {
            if (objectKey.startsWith("staging/")) {
                staged.remove(objectKey);
                return;
            }
            deleteManaged("/media/" + objectKey);
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
