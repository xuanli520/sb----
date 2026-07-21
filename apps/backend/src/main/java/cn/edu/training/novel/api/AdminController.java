package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/admin")
public class AdminController implements UserResolver {
    private final NovelStore store;
    public AdminController(NovelStore store){this.store=store;}
    @GetMapping("/reviews") ApiResponse<List<Book>> reviews(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.pending());}
    @PostMapping("/reviews/{bookId}") ApiResponse<Book> review(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.review(u.id(),bookId,body.approve(),body.reason()));}
    @GetMapping("/dashboard") ApiResponse<Map<String,Object>> dashboard(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(Map.of("activeReaders",store.activeReaders(),"todayReads",store.todayReads(),"publishedBooks",store.published(null,null,null).size(),"pendingReviews",store.pending().size(),"auditLog",store.audits()));}
    @GetMapping("/author-applications") ApiResponse<List<AuthorApplication>> authorApplications(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.authorApplications());}
    @PostMapping("/author-applications/{id}") ApiResponse<AuthorApplication> decideAuthor(HttpServletRequest request,@PathVariable long id,@Valid @RequestBody ReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.decideAuthorApplication(u.id(),id,body.approve(),body.reason()));}
    @GetMapping("/sensitive-words") ApiResponse<Set<String>> sensitiveWords(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.sensitiveWords());}
    @PostMapping("/sensitive-words") ApiResponse<Map<String,String>> addSensitiveWord(HttpServletRequest request,@Valid @RequestBody SensitiveWordRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);store.addSensitiveWord(body.word());return ApiResponse.ok(Map.of("word",body.word()));}
    @GetMapping("/moderation-audits") ApiResponse<List<ContentModerationAudit>> moderationAudits(HttpServletRequest request,@RequestParam(required=false) String contentType,@RequestParam(defaultValue="50") @Min(1) @Max(200) int limit){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.moderationAudits(contentType,limit));}
    @GetMapping("/moderation-reviews") ApiResponse<List<ContentModerationReview>> moderationReviews(HttpServletRequest request,@RequestParam @Min(1) long bookId,@RequestParam(defaultValue="50") @Min(1) @Max(200) int limit){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.moderationReviews(bookId,limit));}
    public record ReviewRequest(boolean approve,@NotBlank @Size(max=1024) String reason){}
    // Content moderation decisions are stored separately with a 900-character limit.
    public record BookReviewRequest(boolean approve,@NotBlank @Size(max=900) String reason){}
    public record SensitiveWordRequest(@NotBlank @Size(max=128) String word){}
}
