package cn.edu.training.novel.service;

import cn.edu.training.novel.config.CoverStorageProperties;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

/**
 * Validates the actual image stream before it reaches storage. The browser-provided MIME type and
 * filename are intentionally ignored because either can be forged.
 */
@Component
public class CoverImageValidator {
    private static final long MAX_PIXELS = 16_777_216L;
    private final CoverStorageProperties properties;

    public CoverImageValidator(CoverStorageProperties properties) { this.properties = properties; }

    public CoverImage validate(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new InvalidCoverImageException("cover image file is required");
        long maxBytes = properties.maxBytes();
        if (maxBytes < 1024) throw new IllegalStateException("cover image upload limit is not configured");
        byte[] bytes = readBounded(file, maxBytes);

        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            if (input == null) throw new InvalidCoverImageException("cover image must be PNG or JPEG data");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new InvalidCoverImageException("cover image must be PNG or JPEG data");
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                String format = reader.getFormatName().toLowerCase(java.util.Locale.ROOT);
                String contentType;
                String extension;
                if ("png".equals(format)) {
                    contentType = "image/png";
                    extension = "png";
                } else if ("jpeg".equals(format) || "jpg".equals(format)) {
                    contentType = "image/jpeg";
                    extension = "jpg";
                } else {
                    throw new InvalidCoverImageException("cover image must be PNG or JPEG data");
                }
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > properties.maxWidth() || height > properties.maxHeight()
                        || (long) width * height > MAX_PIXELS) {
                    throw new InvalidCoverImageException("cover image dimensions are outside the allowed range");
                }
                BufferedImage decoded = reader.read(0);
                if (decoded == null) throw new InvalidCoverImageException("cover image cannot be decoded");
                return new CoverImage(bytes, contentType, extension, width, height);
            } finally {
                reader.dispose();
            }
        } catch (IOException exception) {
            throw new InvalidCoverImageException("cover image must be valid PNG or JPEG data", exception);
        }
    }

    private static byte[] readBounded(MultipartFile file, long maxBytes) {
        if (file.getSize() > maxBytes) throw new InvalidCoverImageException("cover image is too large");
        try (InputStream input = file.getInputStream()) {
            byte[] bytes = input.readNBytes(Math.toIntExact(maxBytes + 1));
            if (bytes.length == 0) throw new InvalidCoverImageException("cover image file is required");
            if (bytes.length > maxBytes) throw new InvalidCoverImageException("cover image is too large");
            return bytes;
        } catch (IOException | ArithmeticException exception) {
            throw new InvalidCoverImageException("cover image cannot be read", exception);
        }
    }
}
