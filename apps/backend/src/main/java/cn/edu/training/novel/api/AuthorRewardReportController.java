package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.AuthorRewardReport;
import cn.edu.training.novel.service.AuthorRewardReportService;
import cn.edu.training.novel.service.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Contract for {@code GET /api/v1/author/reward-records}: {@code bookId}, {@code from} and
 * {@code to} are optional filters; dates use ISO-8601 {@code yyyy-MM-dd}. {@code from} and
 * {@code to} are inclusive calendar-day bounds in {@code Asia/Shanghai}. The response's
 * {@code summary} aggregates every matching successful token reward, while {@code items} is the
 * requested page. Amounts are platform tokens only, never a fiat-currency claim.
 */
@RestController
@Validated
@RequestMapping("/api/v1/author/reward-records")
public class AuthorRewardReportController implements UserResolver {
    private final AuthorRewardReportService service;

    public AuthorRewardReportController(AuthorRewardReportService service) {
        this.service = service;
    }

    @GetMapping
    ApiResponse<AuthorRewardReport> rewards(
            HttpServletRequest request,
            @RequestParam(required = false) @Positive Long bookId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") @Min(0) @Max(100_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        CurrentUser actor = current(request);
        return ApiResponse.ok(service.report(actor, bookId, from, to, page, size));
    }
}
