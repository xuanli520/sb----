package cn.edu.training.novel.api;

import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.EmailVerificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Internal BFF authentication contract. It is intentionally not a browser-facing controller. */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService authService;
    private final EmailVerificationService emailVerificationService;

    public AuthController(AuthService authService, EmailVerificationService emailVerificationService) {
        this.authService = authService;
        this.emailVerificationService = emailVerificationService;
    }

    @PostMapping("/email-verification")
    ApiResponse<EmailVerificationDeliveryData> requestEmailVerification(
            @Valid @RequestBody EmailVerificationRequest request) {
        EmailVerificationService.VerificationDelivery delivery = emailVerificationService.requestRegistrationCode(request.email());
        return ApiResponse.ok(new EmailVerificationDeliveryData(delivery.expiresAt(), delivery.resendAvailableAt()));
    }

    @PostMapping("/register")
    ApiResponse<SessionData> register(@Valid @RequestBody RegisterRequest request) {
        return ApiResponse.ok(toSessionData(authService.registerFromBff(
                request.username(), request.displayName(), request.password(), request.channel(), request.verificationCode())));
    }

    @PostMapping("/login")
    ApiResponse<SessionData> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(toSessionData(authService.loginFromBff(request.username(), request.password())));
    }

    @GetMapping("/session")
    ApiResponse<UserData> session(@RequestHeader(value = "X-Novel-Bff-Session", required = false) String sessionId) {
        CurrentUser user = authService.resolveBffSession(sessionId).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED, "authentication required"));
        return ApiResponse.ok(new UserData(user.id(), user.name(), user.roles()));
    }

    @PostMapping("/logout")
    ApiResponse<Void> logout(@RequestHeader(value = "X-Novel-Bff-Session", required = false) String sessionId) {
        authService.logoutBffSession(sessionId);
        return ApiResponse.ok(null);
    }

    private static SessionData toSessionData(AuthService.AuthenticatedSession session) {
        CurrentUser user = session.user();
        return new SessionData(session.bffSessionId(), new UserData(user.id(), user.name(), user.roles()), session.expiresAt());
    }

    public record RegisterRequest(
            @NotBlank @Email @Pattern(regexp = "[A-Za-z0-9._@+-]{3,120}") String username,
            @NotBlank @Size(min = 1, max = 128) String displayName,
            @NotBlank @Size(min = 12, max = 128) String password,
            @Size(max = 32) String channel,
            @NotBlank @Pattern(regexp = "[0-9]{6}", message = "must contain six digits") String verificationCode) {}

    public record EmailVerificationRequest(
            @NotBlank @Email @Size(max = 120) String email) {}

    public record LoginRequest(
            @NotBlank @Email @Pattern(regexp = "[A-Za-z0-9._@+-]{3,120}") String username,
            @NotBlank @Size(min = 12, max = 128) String password) {}

    public record SessionData(String sessionId, UserData user, Instant expiresAt) {}
    public record EmailVerificationDeliveryData(Instant expiresAt, Instant resendAvailableAt) {}
    public record UserData(long id, String name, java.util.Set<cn.edu.training.novel.domain.Role> roles) {}
}
