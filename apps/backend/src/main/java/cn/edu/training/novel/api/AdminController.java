package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/admin")
public class AdminController implements UserResolver {
    private final NovelStore store;
    private final EmailDeliverySettingsService emailDeliverySettingsService;
    private final BookPresentationService bookPresentations;
    private final BookPageService bookPageService;
    private final LegacyReviewTriageService legacyReviewTriageService;
    private final ModerationHistoryPageService moderationHistoryPages;
    private final SensitiveWordPageService sensitiveWordPages;
    private final AuthorApplicationPageService authorApplicationPages;
    public AdminController(
            NovelStore store,
            EmailDeliverySettingsService emailDeliverySettingsService,
            BookPresentationService bookPresentations,
            BookPageService bookPageService,
            LegacyReviewTriageService legacyReviewTriageService,
            ModerationHistoryPageService moderationHistoryPages,
            SensitiveWordPageService sensitiveWordPages,
            AuthorApplicationPageService authorApplicationPages) {
        this.store=store;
        this.emailDeliverySettingsService=emailDeliverySettingsService;
        this.bookPresentations=bookPresentations;
        this.bookPageService=bookPageService;
        this.legacyReviewTriageService=legacyReviewTriageService;
        this.moderationHistoryPages=moderationHistoryPages;
        this.sensitiveWordPages=sensitiveWordPages;
        this.authorApplicationPages=authorApplicationPages;
    }
    @GetMapping("/reviews")
    ApiResponse<BookPresentationPage> reviews(
            HttpServletRequest request,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="12") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(store.pendingBooks(page, size));
    }
    @PostMapping("/reviews/{bookId}") ApiResponse<BookPresentation> review(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(bookPresentations.present(store.review(u.id(),bookId,body.approve(),body.reason())));}
    @GetMapping("/reviews/queue")
    ApiResponse<ModerationReviewQueuePage> reviewQueue(
            HttpServletRequest request,
            @RequestParam(required=false) ModerationReviewScope scope,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="12") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        ModerationReviewQueuePage source=store.reviewQueue(scope,page,size);
        return ApiResponse.ok(new ModerationReviewQueuePage(source.items().stream().map(this::presentQueueItem).toList(),source.meta()));
    }
    @PostMapping("/reviews/candidates/{candidateId}") ApiResponse<ChapterCandidate> reviewCandidate(HttpServletRequest request,@PathVariable long candidateId,@Valid @RequestBody CandidateReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.reviewChapterCandidate(u.id(),candidateId,body.approve(),body.reason()));}
    @GetMapping("/legacy-review-triage")
    ApiResponse<BookPresentationPage> legacyReviewTriage(
            HttpServletRequest request,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="12") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(bookPageService.legacyReviewTriage(page, size));
    }
    @PostMapping("/legacy-review-triage/{bookId}")
    ApiResponse<BookPresentation> decideLegacyReviewTriage(
            HttpServletRequest request,
            @PathVariable long bookId,
            @Valid @RequestBody LegacyReviewTriageRequest body) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(bookPresentations.present(
                legacyReviewTriageService.decide(u.id(), bookId, body.action(), body.reason())));
    }
    @GetMapping("/legacy-review-triage/{bookId}/audits")
    ApiResponse<LegacyReviewTriageAuditPage> legacyReviewTriageAudits(
            HttpServletRequest request,
            @PathVariable long bookId,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        store.book(bookId);
        return ApiResponse.ok(bookPageService.legacyReviewTriageAudits(bookId, page, size));
    }
    @GetMapping("/books")
    ApiResponse<BookPresentationPage> availabilityManagedBooks(
            HttpServletRequest request,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="12") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(store.availabilityManagedBooks(page, size));
    }
    @PostMapping("/books/{bookId}/takedown") ApiResponse<BookPresentation> takeDownBook(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookStatusRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(bookPresentations.present(store.takeDownBook(u.id(),bookId,body.reason())));}
    @PostMapping("/books/{bookId}/restore") ApiResponse<BookPresentation> restoreBook(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookStatusRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(bookPresentations.present(store.restoreBookForReview(u.id(),bookId,body.reason())));}
    @GetMapping("/books/{bookId}/status-audits")
    ApiResponse<BookStatusAuditPage> bookStatusAudits(
            HttpServletRequest request,
            @PathVariable long bookId,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(store.bookStatusAudits(bookId, page, size));
    }
    @GetMapping("/dashboard") ApiResponse<Map<String,Object>> dashboard(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(Map.of("activeReaders",store.activeReaders(),"todayReads",store.todayReads(),"publishedBooks",store.published(null,null,null).size(),"pendingReviews",store.reviewQueue(null,0,1).meta().total(),"auditLog",store.audits()));}
    @GetMapping("/author-applications")
    ApiResponse<AuthorApplicationPage> authorApplications(
            HttpServletRequest request,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(AuthorApplicationPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(authorApplicationPages.pendingApplications(page, size));
    }
    @PostMapping("/author-applications/{id}") ApiResponse<AuthorApplication> decideAuthor(HttpServletRequest request,@PathVariable long id,@Valid @RequestBody ReviewRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.decideAuthorApplication(u.id(),id,body.approve(),body.reason()));}
    @GetMapping("/sensitive-words")
    ApiResponse<SensitiveWordPage> sensitiveWords(
            HttpServletRequest request,
            @RequestParam(required=false) @Size(max=128) String query,
            @RequestParam(required=false) Boolean enabled,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(SensitiveWordPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(sensitiveWordPages.words(query, enabled, page, size));
    }
    @PostMapping("/sensitive-words") ApiResponse<SensitiveWord> addSensitiveWord(HttpServletRequest request,@Valid @RequestBody SensitiveWordRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.addSensitiveWord(u.id(),body.word()));}
    @PutMapping("/sensitive-words/{normalizedWord}") ApiResponse<SensitiveWord> updateSensitiveWord(HttpServletRequest request,@PathVariable String normalizedWord,@Valid @RequestBody SensitiveWordUpdateRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.updateSensitiveWord(u.id(),normalizedWord,body.word(),body.reason()));}
    @PutMapping("/sensitive-words/{normalizedWord}/enabled") ApiResponse<SensitiveWord> setSensitiveWordEnabled(HttpServletRequest request,@PathVariable String normalizedWord,@Valid @RequestBody SensitiveWordEnabledRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(store.setSensitiveWordEnabled(u.id(),normalizedWord,body.enabled(),body.reason()));}
    @DeleteMapping("/sensitive-words/{normalizedWord}") ApiResponse<Void> deleteSensitiveWord(HttpServletRequest request,@PathVariable String normalizedWord,@Valid @RequestBody SensitiveWordDeleteRequest body){CurrentUser u=current(request);u.require(Role.ADMIN);store.deleteSensitiveWord(u.id(),normalizedWord,body.reason());return ApiResponse.ok(null);}
    @GetMapping("/sensitive-words/audits")
    ApiResponse<SensitiveWordAuditPage> sensitiveWordAudits(
            HttpServletRequest request,
            @RequestParam(required=false) @Size(max=128) String normalizedWord,
            @RequestParam(required=false) @Size(max=32) String action,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(SensitiveWordPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.ADMIN);
        return ApiResponse.ok(sensitiveWordPages.audits(normalizedWord, action, page, size));
    }
    @GetMapping("/email-delivery-settings") ApiResponse<EmailDeliverySettingsView> emailDeliverySettings(HttpServletRequest request){CurrentUser u=current(request);u.requireSuperAdministrator();return ApiResponse.ok(emailDeliverySettingsService.currentView(u));}
    @PutMapping("/email-delivery-settings") ApiResponse<EmailDeliverySettingsView> updateEmailDeliverySettings(HttpServletRequest request,@Valid @RequestBody EmailDeliverySettingsUpdateRequest body){CurrentUser u=current(request);u.requireSuperAdministrator();return ApiResponse.ok(emailDeliverySettingsService.update(u,new EmailDeliverySettingsService.UpdateCommand(body.enabled(),body.host(),body.port(),body.username(),body.password(),body.from(),body.smtpAuth(),body.sslEnabled(),body.verificationHashSecret(),body.reason())));}
    @PostMapping("/email-delivery-settings/verify") ApiResponse<Void> verifyEmailDeliverySettings(HttpServletRequest request,@Valid @RequestBody EmailDeliverySettingsVerificationRequest body){CurrentUser u=current(request);u.requireSuperAdministrator();emailDeliverySettingsService.verifyDelivery(u,body.recipient());return ApiResponse.ok(null);}
    @GetMapping("/moderation-audits") ApiResponse<ContentModerationAuditPage> moderationAudits(HttpServletRequest request,@RequestParam(required=false) @Size(max=32) String contentType,@RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="50") @Min(1) @Max(ModerationHistoryPageService.MAX_PAGE_SIZE) int size){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(moderationHistoryPages.audits(contentType,page,size));}
    @GetMapping("/moderation-reviews") ApiResponse<ContentModerationReviewPage> moderationReviews(HttpServletRequest request,@RequestParam @Min(1) long bookId,@RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="50") @Min(1) @Max(ModerationHistoryPageService.MAX_PAGE_SIZE) int size){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(moderationHistoryPages.reviews(bookId,page,size));}
    @GetMapping("/moderation-snapshots") ApiResponse<BookModerationSnapshotPage> moderationSnapshots(HttpServletRequest request,@RequestParam @Min(1) long bookId,@RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="20") @Min(1) @Max(ModerationHistoryPageService.MAX_PAGE_SIZE) int size){CurrentUser u=current(request);u.require(Role.ADMIN);return ApiResponse.ok(moderationHistoryPages.snapshots(bookId,page,size));}
    public record ReviewRequest(boolean approve,@NotBlank @Size(max=1024) String reason){}
    // Content moderation decisions are stored separately with a 900-character limit.
    public record BookReviewRequest(boolean approve,@NotBlank @Size(max=900) String reason){}
    public record CandidateReviewRequest(boolean approve,@NotBlank @Size(max=900) String reason){}
    public record LegacyReviewTriageRequest(
            @NotNull LegacyReviewTriageAction action,
            @NotBlank @Size(max=900) String reason){}
    public record BookStatusRequest(@NotBlank @Size(max=1024) String reason){}
    public record SensitiveWordRequest(@NotBlank @Size(max=128) String word){}
    public record SensitiveWordUpdateRequest(@NotBlank @Size(max=128) String word,@NotBlank @Size(max=512) String reason){}
    public record SensitiveWordEnabledRequest(boolean enabled,@NotBlank @Size(max=512) String reason){}
    public record SensitiveWordDeleteRequest(@NotBlank @Size(max=512) String reason){}
    public record EmailDeliverySettingsUpdateRequest(boolean enabled,@NotBlank @Size(max=255) String host,@Min(1) @Max(65535) int port,@NotBlank @Size(max=255) String username,@Size(max=1024) String password,@NotBlank @jakarta.validation.constraints.Email @Size(max=320) String from,boolean smtpAuth,boolean sslEnabled,@Size(max=1024) String verificationHashSecret,@NotBlank @Size(max=512) String reason){
        @Override public String toString(){return "EmailDeliverySettingsUpdateRequest[redacted]";}
    }
    public record EmailDeliverySettingsVerificationRequest(@NotBlank @jakarta.validation.constraints.Email @Size(max=320) String recipient){}
    private ModerationReviewQueueItem presentQueueItem(ModerationReviewQueueItem item){
        return item.book()==null?item:new ModerationReviewQueueItem(item.scope(),bookPresentations.resolveCover(item.book()),item.candidate());
    }
}
