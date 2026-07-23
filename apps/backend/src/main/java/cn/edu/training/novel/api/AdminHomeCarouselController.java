package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.HomeCarouselSlide;
import cn.edu.training.novel.domain.HomeCarouselSlideAudit;
import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookPresentation;
import cn.edu.training.novel.domain.BookCoverCandidateQueueItem;
import cn.edu.training.novel.domain.BookCoverCandidateStatus;
import cn.edu.training.novel.domain.CoverCandidatePage;
import cn.edu.training.novel.domain.CoverCandidateReviewResult;
import cn.edu.training.novel.domain.MediaAsset;
import cn.edu.training.novel.domain.MediaAssetAudit;
import cn.edu.training.novel.domain.MediaAssetBinding;
import cn.edu.training.novel.domain.MediaAssetPage;
import cn.edu.training.novel.domain.MediaAssetState;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.BookPresentationService;
import cn.edu.training.novel.service.CoverObjectStorage;
import cn.edu.training.novel.service.HomeCarouselService;
import cn.edu.training.novel.service.MediaAssetService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.io.InputStream;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Stationmaster endpoints for the home carousel and platform-owned banner asset lifecycle. */
@RestController
@Validated
@RequestMapping("/api/v1/admin")
public class AdminHomeCarouselController implements UserResolver {
    private final HomeCarouselService carousel;
    private final MediaAssetService mediaAssets;
    private final BookPresentationService bookPresentations;

    public AdminHomeCarouselController(
            HomeCarouselService carousel,
            MediaAssetService mediaAssets,
            BookPresentationService bookPresentations) {
        this.carousel = carousel;
        this.mediaAssets = mediaAssets;
        this.bookPresentations = bookPresentations;
    }

    @GetMapping("/home-carousel")
    ApiResponse<List<HomeCarouselSlide>> slides(HttpServletRequest request) {
        administrator(request);
        return ApiResponse.ok(carousel.slides());
    }

    @PostMapping("/home-carousel")
    ApiResponse<HomeCarouselSlide> createSlide(
            HttpServletRequest request,
            @Valid @RequestBody HomeCarouselCreateRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(carousel.create(administrator.id(), new HomeCarouselService.CreateCommand(
                body.bookId(),
                body.bannerAssetId(),
                body.headline(),
                body.copy(),
                body.enabled() == null || body.enabled(),
                body.rank())));
    }

    @PutMapping("/home-carousel/{slideId}")
    ApiResponse<HomeCarouselSlide> updateSlide(
            HttpServletRequest request,
            @PathVariable @Positive long slideId,
            @Valid @RequestBody HomeCarouselUpdateRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(carousel.update(administrator.id(), slideId, new HomeCarouselService.UpdateCommand(
                body.bookId(),
                body.bannerAssetId(),
                body.headline(),
                body.copy(),
                body.enabled(),
                body.rank(),
                body.version())));
    }

    @DeleteMapping("/home-carousel/{slideId}")
    ApiResponse<Void> deleteSlide(
            HttpServletRequest request,
            @PathVariable @Positive long slideId,
            @RequestParam @Min(0) long version) {
        CurrentUser administrator = administrator(request);
        carousel.remove(administrator.id(), slideId, version);
        return ApiResponse.ok(null);
    }

    @GetMapping("/home-carousel/audits")
    ApiResponse<List<HomeCarouselSlideAudit>> carouselAudits(
            HttpServletRequest request,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        administrator(request);
        return ApiResponse.ok(carousel.audits(limit));
    }

    @PostMapping(path = "/media/banners", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ApiResponse<MediaAsset> uploadBanner(
            HttpServletRequest request,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) @Size(max = 128) String label) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(mediaAssets.uploadPlatformBanner(administrator.id(), file, label));
    }

    @GetMapping("/media/banners")
    ApiResponse<MediaAssetPage> banners(
            HttpServletRequest request,
            @RequestParam(required = false) MediaAssetState state,
            @RequestParam(required = false) @Size(max = 128) String query,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "24") @Min(1) @Max(100) int size) {
        administrator(request);
        return ApiResponse.ok(mediaAssets.platformBannerAssets(state, query, page, size));
    }

    @GetMapping("/media/cover-candidates")
    ApiResponse<CoverCandidatePage> coverCandidates(
            HttpServletRequest request,
            @RequestParam(required = false) BookCoverCandidateStatus status,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "24") @Min(1) @Max(100) int size) {
        administrator(request);
        return ApiResponse.ok(presentCoverCandidatePage(mediaAssets.coverCandidatePage(status, page, size)));
    }

    @PostMapping("/media/cover-candidates/{candidateId}/review")
    ApiResponse<CoverCandidateReviewResponse> reviewCoverCandidate(
            HttpServletRequest request,
            @PathVariable @Positive long candidateId,
            @Valid @RequestBody CoverCandidateReviewRequest body) {
        CurrentUser administrator = administrator(request);
        CoverCandidateReviewResult result = mediaAssets.reviewCoverCandidate(
                administrator.id(), candidateId, body.approve(), body.reason());
        return ApiResponse.ok(new CoverCandidateReviewResponse(
                bookPresentations.present(result.book()), result.candidate()));
    }

    @GetMapping("/media/cover-candidates/{candidateId}/preview")
    ResponseEntity<StreamingResponseBody> coverCandidatePreview(
            HttpServletRequest request,
            @PathVariable @Positive long candidateId) {
        administrator(request);
        return privatePreview(mediaAssets.administratorCoverCandidatePreview(candidateId));
    }

    @GetMapping("/media/assets/{assetId}")
    ApiResponse<MediaAsset> asset(HttpServletRequest request, @PathVariable UUID assetId) {
        administrator(request);
        return ApiResponse.ok(mediaAssets.asset(assetId));
    }

    @GetMapping("/media/assets/{assetId}/bindings")
    ApiResponse<List<MediaAssetBinding>> bindings(HttpServletRequest request, @PathVariable UUID assetId) {
        administrator(request);
        return ApiResponse.ok(mediaAssets.bindings(assetId));
    }

    @GetMapping("/media/assets/{assetId}/audits")
    ApiResponse<List<MediaAssetAudit>> mediaAudits(
            HttpServletRequest request,
            @PathVariable UUID assetId,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        administrator(request);
        return ApiResponse.ok(mediaAssets.audits(assetId, limit));
    }

    @PostMapping("/media/assets/{assetId}/archive")
    ApiResponse<MediaAsset> archiveBanner(HttpServletRequest request, @PathVariable UUID assetId) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(mediaAssets.archivePlatformBanner(administrator.id(), assetId));
    }

    @PostMapping("/media/assets/{assetId}/restore")
    ApiResponse<MediaAsset> restoreBanner(HttpServletRequest request, @PathVariable UUID assetId) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(mediaAssets.restorePlatformBanner(administrator.id(), assetId));
    }

    @DeleteMapping("/media/assets/{assetId}")
    ApiResponse<MediaAsset> deleteBanner(HttpServletRequest request, @PathVariable UUID assetId) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(mediaAssets.requestDeletePlatformBanner(administrator.id(), assetId));
    }

    private CurrentUser administrator(HttpServletRequest request) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return user;
    }

    public record HomeCarouselCreateRequest(
            @NotNull @Positive Long bookId,
            UUID bannerAssetId,
            @Size(max = 255) String headline,
            @Size(max = 1024) String copy,
            Boolean enabled,
            @Min(1) @Max(100_000) Integer rank) { }

    public record HomeCarouselUpdateRequest(
            @NotNull @Positive Long bookId,
            UUID bannerAssetId,
            @Size(max = 255) String headline,
            @Size(max = 1024) String copy,
            @NotNull Boolean enabled,
            @NotNull @Min(1) @Max(100_000) Integer rank,
            @NotNull @Min(0) Long version) { }

    public record CoverCandidateReviewRequest(boolean approve, @NotBlank @Size(max = 900) String reason) { }

    /** Publicly returned book data always carries the active cover binding, never a stale raw column. */
    public record CoverCandidateReviewResponse(BookPresentation book, cn.edu.training.novel.domain.BookCoverCandidate candidate) { }

    private CoverCandidatePage presentCoverCandidatePage(CoverCandidatePage page) {
        List<Book> books = page.items().stream()
                .map(BookCoverCandidateQueueItem::book)
                .toList();
        Map<Long, Book> booksById = bookPresentations.resolveCovers(books).stream()
                .collect(java.util.stream.Collectors.toUnmodifiableMap(Book::id, book -> book));
        List<BookCoverCandidateQueueItem> items = page.items().stream()
                .map(item -> new BookCoverCandidateQueueItem(
                        item.scope(),
                        booksById.getOrDefault(item.book().id(), item.book()),
                        item.candidate()))
                .toList();
        return new CoverCandidatePage(items, page.meta());
    }

    private static ResponseEntity<StreamingResponseBody> privatePreview(CoverObjectStorage.StoredMedia media) {
        StreamingResponseBody body = output -> {
            try (InputStream input = media.stream()) {
                input.transferTo(output);
            }
        };
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.contentType()))
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(body);
    }
}
