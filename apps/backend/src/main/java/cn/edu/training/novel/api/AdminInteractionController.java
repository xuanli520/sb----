package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.Comment;
import cn.edu.training.novel.domain.CommentPage;
import cn.edu.training.novel.domain.ParagraphAnnotation;
import cn.edu.training.novel.domain.ParagraphAnnotationPage;
import cn.edu.training.novel.domain.Role;
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

/** Minimal, auditable manual review queue for comments held by automated screening. */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminInteractionController implements UserResolver {
    private final NovelStore store;

    public AdminInteractionController(NovelStore store) {
        this.store = store;
    }

    @GetMapping("/comments")
    ApiResponse<Map<String, Object>> comments(
            HttpServletRequest request,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return ApiResponse.ok(page(store.adminComments(status, page, size)));
    }

    @PostMapping("/comments/{commentId}/review")
    ApiResponse<Comment> review(
            HttpServletRequest request,
            @PathVariable long commentId,
            @Valid @RequestBody CommentReviewRequest body) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return ApiResponse.ok(store.reviewComment(user.id(), commentId, body.approve(), body.reason()));
    }

    @GetMapping("/annotations")
    ApiResponse<Map<String, Object>> annotations(
            HttpServletRequest request,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return ApiResponse.ok(page(store.adminParagraphAnnotations(status, page, size)));
    }

    @PostMapping("/annotations/{annotationId}/review")
    ApiResponse<ParagraphAnnotation> reviewParagraphAnnotation(
            HttpServletRequest request,
            @PathVariable long annotationId,
            @Valid @RequestBody ParagraphAnnotationReviewRequest body) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return ApiResponse.ok(store.reviewParagraphAnnotation(
                user.id(), annotationId, body.approve(), body.reason()));
    }

    public record CommentReviewRequest(boolean approve, @NotBlank @Size(max = 1024) String reason) {}
    public record ParagraphAnnotationReviewRequest(boolean approve, @NotBlank @Size(max = 1024) String reason) {}

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
