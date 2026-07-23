package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.CatalogDiscoveryService;
import cn.edu.training.novel.service.BookPresentationService;
import cn.edu.training.novel.service.NovelStore;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public")
public class PublicController {
    private final NovelStore store;
    private final CatalogDiscoveryService discovery;
    private final BookPresentationService bookPresentations;

    public PublicController(NovelStore store, CatalogDiscoveryService discovery, BookPresentationService bookPresentations) {
        this.store = store;
        this.discovery = discovery;
        this.bookPresentations = bookPresentations;
    }

    @GetMapping("/books")
    ApiResponse<CatalogDiscoveryService.CatalogPage> books(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String type,
            @RequestParam(required = false, name = "status") String serialStatus,
            @RequestParam(required = false) Integer minWords,
            @RequestParam(required = false) Integer maxWords,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "12") @Min(1) @Max(48) int size) {
        // `type` is a documented compatibility alias for clients which call a category a type.
        String selectedCategory = category == null || category.isBlank() ? type : category;
        return ApiResponse.ok(discovery.books(q, selectedCategory, serialStatus, minWords, maxWords, page, size));
    }

    @GetMapping("/books/{id}")
    ApiResponse<ReaderBookDetail> book(@PathVariable long id) {
        return ApiResponse.ok(presentReaderBook(store.publicReaderBook(id)));
    }

    @GetMapping("/home")
    ApiResponse<CatalogDiscoveryService.DiscoveryHome> home() {
        return ApiResponse.ok(discovery.home());
    }

    @GetMapping("/hot")
    ApiResponse<java.util.List<BookPresentation>> hot(@RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(discovery.hot(limit));
    }

    @GetMapping("/recommendations")
    ApiResponse<java.util.List<BookPresentation>> recommendations(@RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(discovery.recommendations(limit));
    }

    @GetMapping("/hot-searches")
    ApiResponse<java.util.List<HotSearchTerm>> hotSearchTerms() {
        return ApiResponse.ok(discovery.hotSearchTerms());
    }

    private ReaderBookDetail presentReaderBook(ReaderBookDetail detail) {
        return new ReaderBookDetail(
                bookPresentations.resolveCover(detail.book()),
                detail.chapters(),
                detail.comments(),
                detail.access(),
                detail.currentUserRating());
    }
}
