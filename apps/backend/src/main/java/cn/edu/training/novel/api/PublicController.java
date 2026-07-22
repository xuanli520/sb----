package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.CatalogDiscoveryService;
import cn.edu.training.novel.service.NovelStore;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public")
public class PublicController {
    private final NovelStore store;
    private final CatalogDiscoveryService discovery;

    public PublicController(NovelStore store, CatalogDiscoveryService discovery) {
        this.store = store;
        this.discovery = discovery;
    }

    @GetMapping("/books")
    ApiResponse<CatalogDiscoveryService.CatalogPage> books(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String type,
            @RequestParam(required = false, name = "status") String serialStatus,
            @RequestParam(required = false) Integer minWords,
            @RequestParam(required = false) Integer maxWords) {
        // `type` is a documented compatibility alias for clients which call a category a type.
        String selectedCategory = category == null || category.isBlank() ? type : category;
        return ApiResponse.ok(discovery.books(q, selectedCategory, serialStatus, minWords, maxWords));
    }

    @GetMapping("/books/{id}")
    ApiResponse<ReaderBookDetail> book(@PathVariable long id) {
        return ApiResponse.ok(store.publicReaderBook(id));
    }

    @GetMapping("/home")
    ApiResponse<CatalogDiscoveryService.DiscoveryHome> home() {
        return ApiResponse.ok(discovery.home());
    }

    @GetMapping("/hot")
    ApiResponse<java.util.List<Book>> hot(@RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(discovery.hot(limit));
    }

    @GetMapping("/recommendations")
    ApiResponse<java.util.List<Book>> recommendations(@RequestParam(defaultValue = "10") int limit) {
        return ApiResponse.ok(discovery.recommendations(limit));
    }

    @GetMapping("/hot-searches")
    ApiResponse<java.util.List<HotSearchTerm>> hotSearchTerms() {
        return ApiResponse.ok(discovery.hotSearchTerms());
    }
}
