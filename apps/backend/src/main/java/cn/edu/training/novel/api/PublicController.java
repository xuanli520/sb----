package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.NovelStore;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/public")
public class PublicController {
    private final NovelStore store;
    public PublicController(NovelStore store) { this.store=store; }
    @GetMapping("/books") ApiResponse<Map<String,Object>> books(@RequestParam(required=false) String q,@RequestParam(required=false) String category,@RequestParam(required=false) String status) { List<Book> items=store.published(q,category,status); return ApiResponse.ok(Map.of("items",items,"meta",Map.of("total",items.size()))); }
    @GetMapping("/books/{id}") ApiResponse<Map<String,Object>> book(@PathVariable long id) { return ApiResponse.ok(Map.of("book",store.publishedBook(id),"chapters",store.publishedChapters(id),"comments",store.comments(id))); }
    @GetMapping("/home") ApiResponse<Map<String,Object>> home() { List<Book> books=store.published(null,null,null); return ApiResponse.ok(Map.of("carousel",books.stream().limit(2).toList(),"recommendations",books,"hot",books.stream().limit(3).toList(),"categories",List.of("科幻","悬疑","古言"))); }
}
