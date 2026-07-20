package cn.edu.training.novel.config;

import cn.edu.training.novel.service.AuthService;
import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.CurrentUserContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class InternalApiAuthInterceptor implements HandlerInterceptor {
    public static final String CURRENT_USER_ATTRIBUTE = InternalApiAuthInterceptor.class.getName() + ".currentUser";
    public static final String BFF_SESSION_HEADER = "X-Novel-Bff-Session";
    private static final String DEVELOPMENT_PRINCIPAL_HEADER = "X-Novel-Development-Principal";
    private final byte[] expectedKey;
    private final AuthService authService;
    private final boolean developmentAuthEnabled;

    public InternalApiAuthInterceptor(
            @Value("${novel.internal-api-key:}") String expectedKey,
            @Value("${novel.development-auth-enabled:false}") boolean developmentAuthEnabled,
            AuthService authService) {
        this.expectedKey = expectedKey.getBytes(StandardCharsets.UTF_8);
        this.developmentAuthEnabled = developmentAuthEnabled;
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        CurrentUserContext.clear();
        String path = request.getRequestURI();
        if (!(isRoute(path, "/api/v1/auth") || isRoute(path, "/api/v1/account")
                || isRoute(path, "/api/v1/author") || isRoute(path, "/api/v1/admin"))) {
            return true;
        }
        String supplied = request.getHeader("X-Novel-Internal-Key");
        if (expectedKey.length == 0 || supplied == null || !MessageDigest.isEqual(expectedKey, supplied.getBytes(StandardCharsets.UTF_8))) {
            reject(response);
            return false;
        }
        // Do not use startsWith("/api/v1/auth"): it also matches /api/v1/author.
        if (isRoute(path, "/api/v1/auth")) return true;

        CurrentUser sessionUser = authService.resolveBffSession(request.getHeader(BFF_SESSION_HEADER)).orElse(null);
        if (sessionUser != null) {
            authenticate(request, sessionUser);
            return true;
        }
        if (developmentAuthEnabled) {
            String role = request.getHeader(DEVELOPMENT_PRINCIPAL_HEADER);
            // The old header is intentionally accepted only behind the explicit development switch.
            if (role == null || role.isBlank()) role = request.getHeader("X-Novel-Principal");
            try {
                if (role != null && !role.isBlank()) {
                    authenticate(request, CurrentUser.development(role));
                    return true;
                }
            } catch (IllegalArgumentException ignored) {
                // Unknown development roles must not fall through to a reader identity.
            }
        }
        reject(response);
        return false;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        CurrentUserContext.clear();
    }

    private static void authenticate(HttpServletRequest request, CurrentUser user) {
        request.setAttribute(CURRENT_USER_ATTRIBUTE, user);
        CurrentUserContext.set(user);
    }

    private static boolean isRoute(String path, String route) {
        return path.equals(route) || path.startsWith(route + "/");
    }

    private static void reject(HttpServletResponse response) throws java.io.IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"code\":401,\"msg\":\"BFF session is required\",\"data\":null}");
    }
}
