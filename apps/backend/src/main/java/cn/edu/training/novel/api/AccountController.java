package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/account")
public class AccountController implements UserResolver {
    private final NovelStore store;
    private final AccountProfileService accountProfileService;
    public AccountController(NovelStore store, AccountProfileService accountProfileService){this.store=store;this.accountProfileService=accountProfileService;}
    @GetMapping("/profile") ApiResponse<AccountProfile> profile(HttpServletRequest request) { return ApiResponse.ok(accountProfileService.profileFor(current(request))); }
    @PutMapping("/profile") ApiResponse<AccountProfile> updateProfile(HttpServletRequest request,@Valid @RequestBody ProfileUpdateRequest body) { return ApiResponse.ok(accountProfileService.updateDisplayName(current(request),body.displayName())); }
    @GetMapping("/entitlements") ApiResponse<AccountEntitlements> entitlements(HttpServletRequest request) { return ApiResponse.ok(accountProfileService.entitlementsFor(current(request))); }
    @GetMapping("/bookshelf") ApiResponse<List<Book>> shelf(HttpServletRequest request) { CurrentUser u=current(request); return ApiResponse.ok(store.shelfBooks(u.id())); }
    @PostMapping("/bookshelf/{bookId}") ApiResponse<Map<String,Object>> shelfToggle(HttpServletRequest request,@PathVariable long bookId) { boolean saved=store.toggleShelf(current(request).id(),bookId); return ApiResponse.ok(Map.of("saved",saved)); }
    @PostMapping("/checkin") ApiResponse<Map<String,Object>> checkin(HttpServletRequest request) { return ApiResponse.ok(Map.of("points",store.checkin(current(request).id()),"awarded",10)); }
    @PostMapping("/redeem") ApiResponse<Map<String,Object>> redeem(HttpServletRequest request,@Valid @RequestBody RedeemRequest body) { return ApiResponse.ok(store.redeem(current(request).id(),body.code())); }
    @GetMapping("/wallet") ApiResponse<Map<String,Object>> wallet(HttpServletRequest request) { CurrentUser u=current(request); return ApiResponse.ok(Map.of("points",store.pointBalance(u.id()),"tokens",store.tokenBalance(u.id()))); }
    @GetMapping("/preferences/reading") ApiResponse<ReadingPreference> preference(HttpServletRequest request) { return ApiResponse.ok(store.preference(current(request).id())); }
    @PutMapping("/preferences/reading") ApiResponse<ReadingPreference> savePreference(HttpServletRequest request,@Valid @RequestBody ReadingPreferenceRequest body) { return ApiResponse.ok(store.savePreference(current(request).id(),body.toDomain())); }
    @GetMapping("/progress") ApiResponse<List<ReadingProgress>> progress(HttpServletRequest request) { return ApiResponse.ok(store.progress(current(request).id())); }
    @PutMapping("/progress") ApiResponse<ReadingProgress> saveProgress(HttpServletRequest request,@Valid @RequestBody ProgressRequest body) { return ApiResponse.ok(store.saveProgress(current(request).id(),body.bookId(),body.chapterId(),body.offset())); }
    @GetMapping("/books/{bookId}/bookmarks") ApiResponse<List<Bookmark>> bookmarks(HttpServletRequest request,@PathVariable long bookId) { return ApiResponse.ok(store.bookmarks(current(request).id(),bookId)); }
    @PostMapping("/books/{bookId}/bookmarks") ApiResponse<Bookmark> bookmark(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookmarkRequest body) { return ApiResponse.ok(store.bookmark(current(request).id(),bookId,body.chapterId(),body.offset(),body.note())); }
    @PostMapping("/books/{bookId}/comments") ApiResponse<Comment> comment(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody CommentRequest body) { CurrentUser u=current(request); return ApiResponse.ok(store.comment(u.id(),u.name(),bookId,body.chapterId(),body.content())); }
    @PostMapping("/books/{bookId}/rating") ApiResponse<Map<String,Object>> rate(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody RatingRequest body) { return ApiResponse.ok(Map.of("average",store.rate(current(request).id(),bookId,body.rating()))); }
    @PostMapping("/books/{bookId}/votes/{type}") ApiResponse<Map<String,Object>> vote(HttpServletRequest request,@PathVariable long bookId,@PathVariable String type) { return ApiResponse.ok(store.vote(current(request).id(),bookId,type)); }
    @PostMapping("/books/{bookId}/reward") ApiResponse<Map<String,Object>> reward(HttpServletRequest request,@PathVariable long bookId,@RequestHeader("Idempotency-Key") String idempotencyKey,@Valid @RequestBody AmountRequest body) { return ApiResponse.ok(store.reward(current(request).id(),bookId,body.amount(),requireIdempotencyKey(idempotencyKey))); }
    @PostMapping("/books/{bookId}/purchase") ApiResponse<Map<String,Object>> purchase(HttpServletRequest request,@PathVariable long bookId,@RequestBody(required=false) AmountRequest ignoredBody) { return ApiResponse.ok(store.purchase(current(request).id(),bookId)); }
    @GetMapping("/author-applications") ApiResponse<AuthorApplication> currentAuthorApplication(HttpServletRequest request) { return ApiResponse.ok(store.currentAuthorApplication(current(request).id()).orElse(null)); }
    @PostMapping("/author-applications") ApiResponse<AuthorApplication> applyAuthor(HttpServletRequest request,@Valid @RequestBody AuthorApplicationRequest body) { return ApiResponse.ok(store.applyAuthor(current(request).id(),body.penName(),body.statement())); }
    public record RedeemRequest(@NotBlank String code) {}
    public record ProfileUpdateRequest(@NotBlank @Size(max=1024) String displayName) {}
    public record ReadingPreferenceRequest(@NotBlank String theme,@NotBlank String font,int fontSize,int lineHeight,int brightness,@NotBlank String pageMode) { ReadingPreference toDomain(){return new ReadingPreference(theme,font,fontSize,lineHeight,brightness,pageMode);} }
    public record ProgressRequest(long bookId,long chapterId,int offset) {}
    public record BookmarkRequest(long chapterId,int offset,String note) {}
    public record CommentRequest(Long chapterId,@NotBlank @Size(max=4000) String content) {}
    public record RatingRequest(int rating) {}
    public record AmountRequest(int amount) {}
    public record AuthorApplicationRequest(@NotBlank @Size(max=128) String penName,@NotBlank @Size(max=4000) String statement) {}
    private static String requireIdempotencyKey(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key is required");
        }
        if (value.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Idempotency-Key must be at most 128 characters");
        }
        return value;
    }
}
