package cn.edu.training.novel.api;

import cn.edu.training.novel.service.CurrentUser;
import cn.edu.training.novel.service.CurrentUserContext;
import cn.edu.training.novel.config.InternalApiAuthInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

interface UserResolver {
    default CurrentUser current(HttpServletRequest request) {
        Object value = request.getAttribute(InternalApiAuthInterceptor.CURRENT_USER_ATTRIBUTE);
        if (value instanceof CurrentUser user) return user;
        CurrentUser contextUser = CurrentUserContext.current().orElse(null);
        if (contextUser != null) return contextUser;
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "authentication required");
    }
}
