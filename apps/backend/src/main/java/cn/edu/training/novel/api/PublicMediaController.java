package cn.edu.training.novel.api;

import cn.edu.training.novel.service.CoverObjectStorage;
import jakarta.servlet.http.HttpServletResponse;
import java.io.InputStream;
import java.util.regex.Pattern;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Local-development read-through for the same strict `/media` paths served by Nginx in production. */
@RestController
@RequestMapping("/api/v1/public/media")
public class PublicMediaController {
    private static final Pattern KIND = Pattern.compile("(?:covers|banners)");
    private static final Pattern FILE = Pattern.compile("[0-9a-fA-F-]{36}\\.(?:png|jpg)");
    private final CoverObjectStorage storage;

    public PublicMediaController(CoverObjectStorage storage) {
        this.storage = storage;
    }

    @GetMapping("/{kind}/{file:.+}")
    ResponseEntity<StreamingResponseBody> media(
            @PathVariable String kind,
            @PathVariable String file,
            HttpServletResponse servletResponse) {
        if (!KIND.matcher(kind).matches() || !FILE.matcher(file).matches()) {
            throw new IllegalArgumentException("media path is invalid");
        }
        String publicUrl = "/media/" + kind + "/" + file;
        CoverObjectStorage.StoredMedia media = storage.openManaged(publicUrl);
        MediaType contentType = MediaType.parseMediaType(media.contentType());
        StreamingResponseBody body = output -> {
            try (InputStream input = media.stream()) {
                input.transferTo(output);
            }
        };
        return ResponseEntity.ok()
                .contentType(contentType)
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(30)).cachePublic().immutable())
                .header("X-Content-Type-Options", "nosniff")
                .body(body);
    }
}
