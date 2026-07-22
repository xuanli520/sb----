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
    private final byte[] expectedKey;
    private final AuthService authService;

    public InternalApiAuthInterceptor(
            @Value("${novel.internal-api-key:}") String expectedKey,
            AuthService authService) {
        this.expectedKey = expectedKey.getBytes(StandardCharsets.UTF_8);
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
            if (sessionUser.passwordChangeRequired() && !allowsPasswordChange(path)) {
                passwordChangeRequired(response);
                return false;
            }
            authenticate(request, sessionUser);
            return true;
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

    private static boolean allowsPasswordChange(String path) {
        return path.equals("/api/v1/account/password")
                || path.equals("/api/v1/auth/session")
                || path.equals("/api/v1/auth/logout");
    }

    private static void reject(HttpServletResponse response) throws java.io.IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"code\":401,\"msg\":\"BFF session is required\",\"data\":null}");
    }

    private static void passwordChangeRequired(HttpServletResponse response) throws java.io.IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"code\":403,\"msg\":\"password change required\",\"data\":null}");
    }
}
