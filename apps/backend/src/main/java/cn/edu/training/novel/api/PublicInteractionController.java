package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.CommentPage;
import cn.edu.training.novel.domain.InteractionStats;
import cn.edu.training.novel.domain.ParagraphAnnotationPage;
import cn.edu.training.novel.service.NovelStore;
import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Public readers can only query visible comments and the corresponding published counters. */
@RestController
@RequestMapping("/api/v1/public")
public class PublicInteractionController {
    private final NovelStore store;

    public PublicInteractionController(NovelStore store) {
        this.store = store;
    }

    @GetMapping("/books/{bookId}/comments")
    ApiResponse<Map<String, Object>> comments(
            @PathVariable long bookId,
            @RequestParam(required = false) Long chapterId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(page(store.publicComments(bookId, chapterId, page, size)));
    }

    @GetMapping("/books/{bookId}/interactions")
    ApiResponse<InteractionStats> interactions(@PathVariable long bookId) {
        return ApiResponse.ok(store.interactionStats(bookId));
    }

    @GetMapping("/books/{bookId}/chapters/{chapterId}/annotations")
    ApiResponse<Map<String, Object>> paragraphAnnotations(
            @PathVariable long bookId,
            @PathVariable long chapterId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(publicAnnotationPage(store.publicParagraphAnnotations(bookId, chapterId, page, size)));
    }

    private static Map<String, Object> page(CommentPage comments) {
        return Map.of(
                "items", comments.items(),
                "meta", Map.of("total", comments.total(), "page", comments.page(), "size", comments.size()));
    }

    private static Map<String, Object> publicAnnotationPage(ParagraphAnnotationPage annotations) {
        return Map.of(
                "items", annotations.items().stream().map(annotation -> new PublicParagraphAnnotation(
                        annotation.id(),
                        annotation.bookId(),
                        annotation.chapterId(),
                        annotation.authorName(),
                        annotation.paragraphIndex(),
                        annotation.selectionStart(),
                        annotation.selectionEnd(),
                        annotation.selectedText(),
                        annotation.note(),
                        annotation.createdAt())).toList(),
                "meta", Map.of("total", annotations.total(), "page", annotations.page(), "size", annotations.size()));
    }

    private record PublicParagraphAnnotation(
            long id,
            long bookId,
            long chapterId,
            String authorName,
            int paragraphIndex,
            int selectionStart,
            int selectionEnd,
            String selectedText,
            String note,
            Instant createdAt) {}
}
