package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.CommentPage;
import cn.edu.training.novel.domain.ParagraphAnnotationPage;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.NovelStore;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Authors may inspect every status for comments attached to books they own. */
@RestController
@RequestMapping("/api/v1/author")
public class AuthorInteractionController implements UserResolver {
    private final NovelStore store;

    public AuthorInteractionController(NovelStore store) {
        this.store = store;
    }

    @GetMapping("/books/{bookId}/comments")
    ApiResponse<Map<String, Object>> comments(
            HttpServletRequest request,
            @PathVariable long bookId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser user = current(request);
        user.require(Role.AUTHOR);
        return ApiResponse.ok(page(store.authorComments(user.id(), bookId, status, page, size)));
    }

    @GetMapping("/books/{bookId}/annotations")
    ApiResponse<Map<String, Object>> annotations(
            HttpServletRequest request,
            @PathVariable long bookId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser user = current(request);
        user.require(Role.AUTHOR);
        return ApiResponse.ok(page(store.authorParagraphAnnotations(user.id(), bookId, status, page, size)));
    }

    private static Map<String, Object> page(CommentPage comments) {
        return Map.of(
                "items", comments.items(),
                "meta", Map.of("total", comments.total(), "page", comments.page(), "size", comments.size()));
    }

    private static Map<String, Object> page(ParagraphAnnotationPage annotations) {
        return Map.of(
                "items", annotations.items(),
                "meta", Map.of("total", annotations.total(), "page", annotations.page(), "size", annotations.size()));
    }
}
