package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.CommercialRuleAuditPage;
import cn.edu.training.novel.domain.CommercialRules;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.CommercialRuleService;
import cn.edu.training.novel.service.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Administrator-only configuration and audit readback for D-10 commercial limits. */
@RestController
@RequestMapping("/api/v1/admin/commercial-rules")
public class AdminCommercialRuleController implements UserResolver {
    private final CommercialRuleService service;

    public AdminCommercialRuleController(CommercialRuleService service) {
        this.service = service;
    }

    @GetMapping
    ApiResponse<CommercialRules> rules(HttpServletRequest request) {
        administrator(request);
        return ApiResponse.ok(service.current());
    }

    @PutMapping
    ApiResponse<CommercialRules> update(
            HttpServletRequest request,
            @Valid @RequestBody CommercialRuleUpdateRequest body) {
        CurrentUser administrator = administrator(request);
        return ApiResponse.ok(service.update(administrator, new CommercialRuleService.UpdateCommand(
                body.membershipDaysMaximumPerCode(),
                body.recommendationVotesPerDay(),
                body.monthlyVotesPerMonth(),
                body.rewardMinimumTokens(),
                body.rewardMaximumTokensPerReward(),
                body.rewardMaximumTokensPerDay(),
                body.reason())));
    }

    @GetMapping("/audits")
    ApiResponse<CommercialRuleAuditPage> audits(
            HttpServletRequest request,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(CommercialRuleService.MAX_PAGE_SIZE) int size) {
        return ApiResponse.ok(service.audits(administrator(request), page, size));
    }

    private CurrentUser administrator(HttpServletRequest request) {
        CurrentUser user = current(request);
        user.require(Role.ADMIN);
        return user;
    }

    public record CommercialRuleUpdateRequest(
            @Min(1) @Max(36_500) int membershipDaysMaximumPerCode,
            @Min(0) @Max(100) int recommendationVotesPerDay,
            @Min(0) @Max(100) int monthlyVotesPerMonth,
            @Min(1) @Max(1_000_000) int rewardMinimumTokens,
            @Min(1) @Max(1_000_000) int rewardMaximumTokensPerReward,
            @Min(1) @Max(5_000_000) int rewardMaximumTokensPerDay,
            @NotBlank @Size(max = 512) String reason) {}
}
