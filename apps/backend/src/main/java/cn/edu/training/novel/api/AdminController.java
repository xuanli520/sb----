package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/admin")
public class AdminController implements UserResolver {
    private final NovelStore store;
    private final AuthService authService;
    public AdminController(NovelStore store,AuthService authService){this.store=store;this.authService=authService;}
    @GetMapping("/reviews") ApiResponse<List<Book>> reviews(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.pending());}
    @PostMapping("/reviews/{bookId}") ApiResponse<Book> review(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody ReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.review(bookId,body.approve(),body.reason()));}
    @GetMapping("/dashboard") ApiResponse<Map<String,Object>> dashboard(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(Map.of("activeReaders",1284,"todayReads",6891,"publishedBooks",store.published(null,null,null).size(),"pendingReviews",store.pending().size(),"auditLog",store.audits()));}
    @GetMapping("/author-applications") ApiResponse<List<AuthorApplication>> authorApplications(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.authorApplications());}
    @PostMapping("/author-applications/{id}") ApiResponse<AuthorApplication> decideAuthor(HttpServletRequest request,@PathVariable long id,@Valid @RequestBody ReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);AuthorApplication application=store.decideAuthorApplication(id,body.approve(),body.reason());if(body.approve())authService.grantRole(application.userId(),Role.AUTHOR);return ApiResponse.ok(application);}
    @GetMapping("/sensitive-words") ApiResponse<Set<String>> sensitiveWords(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.sensitiveWords());}
    @PostMapping("/sensitive-words") ApiResponse<Map<String,String>> addSensitiveWord(HttpServletRequest request,@Valid @RequestBody SensitiveWordRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);store.addSensitiveWord(body.word());return ApiResponse.ok(Map.of("word",body.word()));}
    @PostMapping("/users/{userId}/status") ApiResponse<Map<String,Object>> setUserStatus(HttpServletRequest request,@PathVariable long userId,@RequestBody UserStatusRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);authService.setEnabled(userId,body.enabled());return ApiResponse.ok(Map.of("userId",userId,"enabled",store.setUserEnabled(userId,body.enabled())));}
    public record ReviewRequest(boolean approve,@NotBlank String reason){}
    public record SensitiveWordRequest(@NotBlank String word){}
    public record UserStatusRequest(boolean enabled){}
}
