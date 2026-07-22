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
    @GetMapping("/books") ApiResponse<List<Book>> availabilityManagedBooks(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.availabilityManagedBooks());}
    @PostMapping("/books/{bookId}/takedown") ApiResponse<Book> takeDownBook(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookStatusRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.takeDownBook(u.id(),bookId,body.reason()));}
    @PostMapping("/books/{bookId}/restore") ApiResponse<Book> restoreBook(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookStatusRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.restoreBookForReview(u.id(),bookId,body.reason()));}
    @GetMapping("/books/{bookId}/status-audits") ApiResponse<List<BookStatusAudit>> bookStatusAudits(HttpServletRequest request,@PathVariable long bookId,@RequestParam(defaultValue="20") @Min(1) @Max(100) int limit){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.bookStatusAudits(bookId,limit));}
    @GetMapping("/dashboard") ApiResponse<Map<String,Object>> dashboard(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(Map.of("activeReaders",store.activeReaders(),"todayReads",store.todayReads(),"publishedBooks",store.published(null,null,null).size(),"pendingReviews",store.pending().size(),"auditLog",store.audits()));}
    @GetMapping("/author-applications") ApiResponse<List<AuthorApplication>> authorApplications(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.authorApplications());}
    @PostMapping("/author-applications/{id}") ApiResponse<AuthorApplication> decideAuthor(HttpServletRequest request,@PathVariable long id,@Valid @RequestBody ReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.decideAuthorApplication(u.id(),id,body.approve(),body.reason()));}
    @GetMapping("/sensitive-words") ApiResponse<List<SensitiveWord>> sensitiveWords(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.sensitiveWordEntries());}
    @PostMapping("/sensitive-words") ApiResponse<SensitiveWord> addSensitiveWord(HttpServletRequest request,@Valid @RequestBody SensitiveWordRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.addSensitiveWord(u.id(),body.word()));}
    @PutMapping("/sensitive-words/{normalizedWord}") ApiResponse<SensitiveWord> updateSensitiveWord(HttpServletRequest request,@PathVariable String normalizedWord,@Valid @RequestBody SensitiveWordUpdateRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.updateSensitiveWord(u.id(),normalizedWord,body.word(),body.reason()));}
    @PutMapping("/sensitive-words/{normalizedWord}/enabled") ApiResponse<SensitiveWord> setSensitiveWordEnabled(HttpServletRequest request,@PathVariable String normalizedWord,@Valid @RequestBody SensitiveWordEnabledRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.setSensitiveWordEnabled(u.id(),normalizedWord,body.enabled(),body.reason()));}
    @DeleteMapping("/sensitive-words/{normalizedWord}") ApiResponse<Void> deleteSensitiveWord(HttpServletRequest request,@PathVariable String normalizedWord,@Valid @RequestBody SensitiveWordDeleteRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);store.deleteSensitiveWord(u.id(),normalizedWord,body.reason());return ApiResponse.ok(null);}
    @GetMapping("/sensitive-words/audits") ApiResponse<List<SensitiveWordAudit>> sensitiveWordAudits(HttpServletRequest request,@RequestParam(defaultValue="20") @Min(1) @Max(100) int limit){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.sensitiveWordAudits(limit));}
    @GetMapping("/moderation-audits") ApiResponse<List<ContentModerationAudit>> moderationAudits(HttpServletRequest request,@RequestParam(required=false) String contentType,@RequestParam(defaultValue="50") @Min(1) @Max(200) int limit){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.moderationAudits(contentType,limit));}
    @GetMapping("/moderation-reviews") ApiResponse<List<ContentModerationReview>> moderationReviews(HttpServletRequest request,@RequestParam @Min(1) long bookId,@RequestParam(defaultValue="50") @Min(1) @Max(200) int limit){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.moderationReviews(bookId,limit));}
    @GetMapping("/moderation-snapshots") ApiResponse<List<BookModerationSnapshot>> moderationSnapshots(HttpServletRequest request,@RequestParam @Min(1) long bookId,@RequestParam(defaultValue="20") @Min(1) @Max(100) int limit){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.moderationSnapshots(bookId,limit));}
    public record ReviewRequest(boolean approve,@NotBlank @Size(max=1024) String reason){}
    // Content moderation decisions are stored separately with a 900-character limit.
    public record BookReviewRequest(boolean approve,@NotBlank @Size(max=900) String reason){}
    public record BookStatusRequest(@NotBlank @Size(max=1024) String reason){}
    public record SensitiveWordRequest(@NotBlank @Size(max=128) String word){}
    public record SensitiveWordUpdateRequest(@NotBlank @Size(max=128) String word,@NotBlank @Size(max=512) String reason){}
    public record SensitiveWordEnabledRequest(boolean enabled,@NotBlank @Size(max=512) String reason){}
    public record SensitiveWordDeleteRequest(@NotBlank @Size(max=512) String reason){}
}
