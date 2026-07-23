package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.AccountStatusAuditPage;
import cn.edu.training.novel.domain.AccountStatusChange;
import cn.edu.training.novel.domain.AdminAccountPage;
import cn.edu.training.novel.domain.AdminUserBehaviorEventPage;
import cn.edu.training.novel.domain.AdminUserBehaviorSummary;
import cn.edu.training.novel.domain.OperatingTaxonomyAudit;
import cn.edu.training.novel.domain.OperatingTaxonomyItem;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.AdminOperationsService;
import cn.edu.training.novel.service.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Operations APIs that manage accounts and the canonical category/tag vocabulary. */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminOperationsController implements UserResolver {
    private final AdminOperationsService service;

    public AdminOperationsController(AdminOperationsService service) {
        this.service = service;
    }

    @GetMapping("/accounts")
    ApiResponse<AdminAccountPage> accounts(
            HttpServletRequest request,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String role,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        administrator(request);
        return ApiResponse.ok(service.accounts(query, status, role, page, size));
    }

    @PostMapping("/accounts/{accountId}/status")
    ApiResponse<AccountStatusChange> setAccountStatus(
            HttpServletRequest request,
            @PathVariable @Min(1) long accountId,
            @Valid @RequestBody AccountStatusRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.changeAccountStatus(
                administrator.id(), accountId, body.enabled(), body.reason()));
    }

    /** Retains the previous endpoint shape while providing the required decision reason. */
    @PostMapping("/users/{accountId}/status")
    ApiResponse<AccountStatusChange> setUserStatus(
            HttpServletRequest request,
            @PathVariable @Min(1) long accountId,
            @Valid @RequestBody AccountStatusRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.changeAccountStatus(
                administrator.id(), accountId, body.enabled(), body.reason()));
    }

    @GetMapping("/accounts/{accountId}/status-audits")
    ApiResponse<AccountStatusAuditPage> accountStatusAudits(
            HttpServletRequest request,
            @PathVariable @Min(1) long accountId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        administrator(request);
        return ApiResponse.ok(service.accountStatusAudits(accountId, page, size));
    }

    @GetMapping("/accounts/{accountId}/behavior-summary")
    ApiResponse<AdminUserBehaviorSummary> accountBehaviorSummary(
            HttpServletRequest request,
            @PathVariable @Min(1) long accountId) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.accountBehaviorSummary(administrator.id(), accountId));
    }

    @GetMapping("/accounts/{accountId}/behavior-events")
    ApiResponse<AdminUserBehaviorEventPage> accountBehaviorEvents(
            HttpServletRequest request,
            @PathVariable @Min(1) long accountId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.accountBehaviorEvents(administrator.id(), accountId, page, size));
    }

    @GetMapping("/taxonomy/{type}")
    ApiResponse<List<OperatingTaxonomyItem>> taxonomy(
            HttpServletRequest request,
            @PathVariable String type) {
        administrator(request);
        return ApiResponse.ok(service.taxonomy(type));
    }

    @PostMapping("/taxonomy/{type}")
    ApiResponse<OperatingTaxonomyItem> createTaxonomy(
            HttpServletRequest request,
            @PathVariable String type,
            @Valid @RequestBody TaxonomyRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.createTaxonomy(
                administrator.id(), type, body.name(), body.enabled(), body.sortOrder()));
    }

    @PutMapping("/taxonomy/{type}/{taxonomyId}")
    ApiResponse<OperatingTaxonomyItem> updateTaxonomy(
            HttpServletRequest request,
            @PathVariable String type,
            @PathVariable @Min(1) long taxonomyId,
            @Valid @RequestBody TaxonomyRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.updateTaxonomy(
                administrator.id(), taxonomyId, type, body.name(), body.enabled(), body.sortOrder()));
    }

    @GetMapping("/taxonomy/{type}/audits")
    ApiResponse<List<OperatingTaxonomyAudit>> taxonomyAudits(
            HttpServletRequest request,
            @PathVariable String type,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int limit) {
        administrator(request);
        return ApiResponse.ok(service.taxonomyAudits(type, limit));
    }

    private CurrentUser administrator(HttpServletRequest request) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return user;
    }

    public record AccountStatusRequest(
            boolean enabled,
            @NotBlank @Size(max = 1024) String reason) {}

    public record TaxonomyRequest(
            @NotBlank @Size(max = 128) String name,
            boolean enabled,
            @Min(0) @Max(100_000) int sortOrder) {}
}
