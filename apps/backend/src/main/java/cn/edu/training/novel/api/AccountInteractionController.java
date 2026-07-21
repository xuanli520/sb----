package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.CommentPage;
import cn.edu.training.novel.domain.ParagraphAnnotation;
import cn.edu.training.novel.domain.ParagraphAnnotationPage;
import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.NovelStore;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Lets an authenticated reader inspect the moderation state of only their own comments. */
@RestController
@RequestMapping("/api/v1/account")
public class AccountInteractionController implements UserResolver {
    private final NovelStore store;

    public AccountInteractionController(NovelStore store) {
        this.store = store;
    }

    @GetMapping("/comments")
    ApiResponse<Map<String, Object>> comments(
            HttpServletRequest request,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser user = current(request);
        return ApiResponse.ok(page(store.userComments(user.id(), status, page, size)));
    }

    @GetMapping("/annotations")
    ApiResponse<Map<String, Object>> annotations(
            HttpServletRequest request,
            @RequestParam(required = false) Long bookId,
            @RequestParam(required = false) Long chapterId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser user = current(request);
        return ApiResponse.ok(page(store.userParagraphAnnotations(user.id(), bookId, chapterId, status, page, size)));
    }

    @PostMapping("/books/{bookId}/chapters/{chapterId}/annotations")
    ApiResponse<ParagraphAnnotation> annotate(
            HttpServletRequest request,
            @PathVariable long bookId,
            @PathVariable long chapterId,
            @Valid @RequestBody ParagraphAnnotationRequest body) {
        CurrentUser user = current(request);
        return ApiResponse.ok(store.annotateParagraph(
                user.id(),
                user.name(),
                bookId,
                chapterId,
                body.paragraphIndex(),
                body.selectionStart(),
                body.selectionEnd(),
                body.selectedText(),
                body.note(),
                body.shareIntent()));
    }

    public record ParagraphAnnotationRequest(
            int paragraphIndex,
            int selectionStart,
            int selectionEnd,
            @NotBlank @Size(max = 2000) String selectedText,
            @Size(max = 2000) String note,
            boolean shareIntent) {}

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
