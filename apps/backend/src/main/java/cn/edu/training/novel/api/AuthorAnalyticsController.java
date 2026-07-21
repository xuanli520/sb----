package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.AuthorAnalyticsReport;
import cn.edu.training.novel.service.AuthorAnalyticsService;
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
 * {@code GET /api/v1/author/analytics} returns author-owned FR-08 dashboard data. Supplying
 * {@code from} and {@code to} selects inclusive Shanghai calendar days; omitting both selects the
 * most recent bounded window. Subscription and retention availability are explicit in the body.
 */
@RestController
@Validated
@RequestMapping("/api/v1/author/analytics")
public class AuthorAnalyticsController implements UserResolver {
    private final AuthorAnalyticsService service;

    public AuthorAnalyticsController(AuthorAnalyticsService service) {
        this.service = service;
    }

    @GetMapping
    ApiResponse<AuthorAnalyticsReport> analytics(
            HttpServletRequest request,
            @RequestParam(required = false) @Positive Long bookId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "12") @Min(1) @Max(50) int bookLimit) {
        CurrentUser actor = current(request);
        return ApiResponse.ok(service.report(actor, bookId, from, to, bookLimit));
    }
}
