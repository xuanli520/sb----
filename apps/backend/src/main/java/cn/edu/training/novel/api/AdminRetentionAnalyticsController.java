package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.PlatformRetentionReport;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.service.PlatformRetentionReportService;
import jakarta.servlet.http.HttpServletRequest;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Administrator-only global and channel retention report. */
@RestController
@RequestMapping("/api/v1/admin/analytics")
public class AdminRetentionAnalyticsController implements UserResolver {
    private final PlatformRetentionReportService service;

    public AdminRetentionAnalyticsController(PlatformRetentionReportService service) {
        this.service = service;
    }

    @GetMapping("/retention")
    ApiResponse<PlatformRetentionReport> retention(
            HttpServletRequest request,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        current(request).require(Role.ADMIN);
        return ApiResponse.ok(service.report(from, to, asOf));
    }
}
