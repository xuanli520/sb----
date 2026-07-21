package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.GeneratedRedemptionCodeBatch;
import cn.edu.training.novel.domain.ManagedRedemptionCode;
import cn.edu.training.novel.domain.RedemptionCodePage;
import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.RedemptionCodeAdminService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/v1/admin/redemption-codes")
public class AdminRedemptionCodeController implements UserResolver {
    private final RedemptionCodeAdminService service;

    public AdminRedemptionCodeController(RedemptionCodeAdminService service) {
        this.service = service;
    }

    @GetMapping
    ApiResponse<RedemptionCodePage> list(
            HttpServletRequest request,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String batchNo,
            @RequestParam(required = false) String benefitType,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") @Min(0) @Max(100_000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ApiResponse.ok(service.list(current(request), q, batchNo, benefitType, status, page, size));
    }

    @PostMapping("/generate")
    ApiResponse<GeneratedRedemptionCodeBatch> generate(
            HttpServletRequest request,
            @Valid @RequestBody GenerateRequest body) {
        return ApiResponse.ok(service.generate(current(request), new RedemptionCodeAdminService.GenerateCommand(
                body.quantity(),
                body.batchNo(),
                body.codePrefix(),
                body.tokenAmount(),
                body.membershipDays(),
                body.bookId(),
                body.expiresAt())));
    }

    @PostMapping("/import")
    ApiResponse<ManagedRedemptionCode> importCode(
            HttpServletRequest request,
            @Valid @RequestBody ImportRequest body) {
        return ApiResponse.ok(service.importCode(current(request), new RedemptionCodeAdminService.ImportCommand(
                body.code(),
                body.batchNo(),
                body.tokenAmount(),
                body.membershipDays(),
                body.bookId(),
                body.expiresAt())));
    }

    @PostMapping("/{code}/disable")
    ApiResponse<ManagedRedemptionCode> disable(
            HttpServletRequest request,
            @PathVariable String code,
            @Valid @RequestBody DisableRequest body) {
        return ApiResponse.ok(service.disable(current(request), code, body.reason()));
    }

    public record GenerateRequest(
            @NotNull @Min(1) @Max(1_000) Integer quantity,
            @Size(max = 64) String batchNo,
            @Size(max = 20) String codePrefix,
            @PositiveOrZero @Max(Integer.MAX_VALUE) Long tokenAmount,
            @Min(0) @Max(36_500) Integer membershipDays,
            @Positive Long bookId,
            Instant expiresAt) {}

    public record ImportRequest(
            @NotBlank @Size(min = 4, max = 64) String code,
            @NotBlank @Size(max = 64) String batchNo,
            @PositiveOrZero @Max(Integer.MAX_VALUE) Long tokenAmount,
            @Min(0) @Max(36_500) Integer membershipDays,
            @Positive Long bookId,
            Instant expiresAt) {}

    public record DisableRequest(@Size(max = 512) String reason) {}
}
