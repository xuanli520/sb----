package cn.edu.training.novel.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import cn.edu.training.novel.config.CoverStorageProperties;
import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Optional;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class CoverUploadServiceTest {
    @Test
    void databaseWriteFailureCompensatesTheNewManagedObject() throws Exception {
        CatalogRepository catalogRepository = org.mockito.Mockito.mock(CatalogRepository.class);
        AuditTrail auditTrail = org.mockito.Mockito.mock(AuditTrail.class);
        MediaAssetService mediaAssets = org.mockito.Mockito.mock(MediaAssetService.class);
        RecordingStorage storage = new RecordingStorage();
        CoverImageValidator validator = new CoverImageValidator(new CoverStorageProperties(
                false, "", "", "", "novel-covers", "/media", 5_242_880, 4096, 4096));
        CoverUploadService service = new CoverUploadService(
                catalogRepository,
                auditTrail,
                storage,
                validator,
                mediaAssets);
        Book book = new Book(77L, "draft", "author", "科幻", 0, "连载中", "synopsis", "#123456", BookStatus.DRAFT, 2L, 0L);
        when(catalogRepository.findByIdForUpdate(77L)).thenReturn(Optional.of(book));
        doThrow(new IllegalStateException("forced database failure"))
                .when(mediaAssets)
                .registerAuthorBookCover(anyLong(), anyLong(), any(CoverObjectStorage.StoredCover.class), any(CoverImage.class));

        assertThatThrownBy(() -> service.upload(2L, 77L, png()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("forced database failure");
        org.assertj.core.api.Assertions.assertThat(storage.deleted).containsExactly(storage.generatedUrl);
    }

    private static MockMultipartFile png() throws Exception {
        BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return new MockMultipartFile("file", "untrusted.png", "image/png", output.toByteArray());
    }

    static final class RecordingStorage implements CoverObjectStorage {
        String generatedUrl;
        final java.util.List<String> deleted = new java.util.ArrayList<>();

        @Override public StoredCover store(CoverImage image) {
            generatedUrl = "/media/covers/11111111-1111-1111-1111-111111111111.png";
            return new StoredCover(generatedUrl, "covers/11111111-1111-1111-1111-111111111111.png");
        }
        @Override public void deleteManaged(String publicUrl) { deleted.add(publicUrl); }
        @Override public boolean isManaged(String publicUrl) { return generatedUrl != null && generatedUrl.equals(publicUrl); }
    }
}
