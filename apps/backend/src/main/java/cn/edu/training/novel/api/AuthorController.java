package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/author")
public class AuthorController implements UserResolver {
    private final NovelStore store;
    public AuthorController(NovelStore store){this.store=store;}
    @GetMapping("/books") ApiResponse<List<Book>> list(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.authorBooks(u.id()));}
    @PostMapping("/books") ApiResponse<Book> create(HttpServletRequest request,@Valid @RequestBody BookRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.createBook(u.id(),body.title(),body.category(),body.synopsis()));}
    @PostMapping("/books/{bookId}/chapters") ApiResponse<Chapter> chapter(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody ChapterRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.addChapter(u.id(),bookId,body.title(),body.content(),body.submit()));}
    @PostMapping("/books/{bookId}/submit") ApiResponse<Book> submit(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.submitBook(u.id(),bookId));}
    public record BookRequest(@NotBlank String title,@NotBlank String category,@NotBlank String synopsis){}
    public record ChapterRequest(@NotBlank String title,@NotBlank String content,boolean submit){}
}
