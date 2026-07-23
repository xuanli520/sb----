package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.EditorialRecommendation;
import cn.edu.training.novel.domain.EditorialRecommendationAuditPage;
import cn.edu.training.novel.domain.EditorialRecommendationPage;
import cn.edu.training.novel.domain.HotSearchTerm;
import cn.edu.training.novel.domain.HotSearchTermAuditPage;
import cn.edu.training.novel.domain.HotSearchTermPage;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.EditorialOperationsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Administrative contract for persisted editorial placement and hot-search configuration. */
@RestController
@Validated
@RequestMapping("/api/v1/admin")
public class EditorialOperationsController implements UserResolver {
    private final EditorialOperationsService service;

    public EditorialOperationsController(EditorialOperationsService service) {
        this.service = service;
    }

    @GetMapping("/editorial/recommendations")
    ApiResponse<EditorialRecommendationPage> recommendations(
            HttpServletRequest request,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(EditorialOperationsService.MAX_PAGE_SIZE) int size) {
        administrator(request);
        return ApiResponse.ok(service.recommendations(page, size));
    }

    @PostMapping("/editorial/recommendations")
    ApiResponse<EditorialRecommendation> assignRecommendation(
            HttpServletRequest request,
            @Valid @RequestBody RecommendationAssignmentRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.assignRecommendation(administrator.id(), body.bookId(), body.rank()));
    }

    @PutMapping("/editorial/recommendations/{bookId}")
    ApiResponse<EditorialRecommendation> reorderRecommendation(
            HttpServletRequest request,
            @PathVariable @Positive long bookId,
            @Valid @RequestBody RecommendationRankRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.reorderRecommendation(administrator.id(), bookId, body.rank()));
    }

    @DeleteMapping("/editorial/recommendations/{bookId}")
    ApiResponse<Void> removeRecommendation(
            HttpServletRequest request,
            @PathVariable @Positive long bookId) {
        CurrentUser administrator = administrator(request);
        service.removeRecommendation(administrator.id(), bookId);
        return ApiResponse.ok(null);
    }

    @GetMapping("/editorial/recommendations/audits")
    ApiResponse<EditorialRecommendationAuditPage> recommendationAudits(
            HttpServletRequest request,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(EditorialOperationsService.MAX_PAGE_SIZE) int size) {
        administrator(request);
        return ApiResponse.ok(service.recommendationAudits(page, size));
    }

    @GetMapping("/hot-searches")
    ApiResponse<HotSearchTermPage> hotSearchTerms(
            HttpServletRequest request,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(EditorialOperationsService.MAX_PAGE_SIZE) int size) {
        administrator(request);
        return ApiResponse.ok(service.hotSearchTerms(page, size));
    }

    @PostMapping("/hot-searches")
    ApiResponse<HotSearchTerm> createHotSearchTerm(
            HttpServletRequest request,
            @Valid @RequestBody HotSearchTermCreateRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.createHotSearchTerm(
                administrator.id(), body.term(), body.enabled(), body.rank()));
    }

    @PutMapping("/hot-searches/{termId}")
    ApiResponse<HotSearchTerm> updateHotSearchTerm(
            HttpServletRequest request,
            @PathVariable @Positive long termId,
            @Valid @RequestBody HotSearchTermUpdateRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.updateHotSearchTerm(
                administrator.id(), termId, body.term(), body.enabled(), body.rank()));
    }

    @DeleteMapping("/hot-searches/{termId}")
    ApiResponse<Void> removeHotSearchTerm(
            HttpServletRequest request,
            @PathVariable @Positive long termId) {
        CurrentUser administrator = administrator(request);
        service.removeHotSearchTerm(administrator.id(), termId);
        return ApiResponse.ok(null);
    }

    @GetMapping("/hot-searches/audits")
    ApiResponse<HotSearchTermAuditPage> hotSearchTermAudits(
            HttpServletRequest request,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(EditorialOperationsService.MAX_PAGE_SIZE) int size) {
        administrator(request);
        return ApiResponse.ok(service.hotSearchTermAudits(page, size));
    }

    private CurrentUser administrator(HttpServletRequest request) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return user;
    }

    public record RecommendationAssignmentRequest(
            @NotNull @Positive Long bookId,
            @Min(1) @Max(100_000) Integer rank) {}

    public record RecommendationRankRequest(
            @NotNull @Min(1) @Max(100_000) Integer rank) {}

    public record HotSearchTermCreateRequest(
            @NotBlank @Size(max = 100) String term,
            boolean enabled,
            @Min(1) @Max(100_000) Integer rank) {}

    public record HotSearchTermUpdateRequest(
            @NotBlank @Size(max = 100) String term,
            boolean enabled,
            @NotNull @Min(1) @Max(100_000) Integer rank) {}
}
