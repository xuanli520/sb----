package cn.edu.training.novel.service;

import java.util.Optional;

/** Request-lifetime fallback for MVC request wrappers that do not expose interceptor attributes. */
public final class CurrentUserContext {
    private static final ThreadLocal<CurrentUser> CURRENT = new ThreadLocal<>();

    private CurrentUserContext() {}

    public static void set(CurrentUser user) { CURRENT.set(user); }
    public static Optional<CurrentUser> current() { return Optional.ofNullable(CURRENT.get()); }
    public static void clear() { CURRENT.remove(); }
}
