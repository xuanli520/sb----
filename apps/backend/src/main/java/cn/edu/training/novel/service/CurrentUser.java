package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Role;
import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public record CurrentUser(long id, String name, Set<Role> roles) {
    /** Development identities are intentionally separate from persisted account sessions. */
    public static CurrentUser development(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("development role is required");
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "author" -> new CurrentUser(2, "林墨", Set.of(Role.READER, Role.AUTHOR));
            case "admin" -> new CurrentUser(1, "站长", Set.of(Role.READER, Role.AUTHOR, Role.ADMIN));
            case "reader" -> new CurrentUser(3, "演示读者", Set.of(Role.READER));
            default -> throw new IllegalArgumentException("unsupported development role");
        };
    }
    public void require(Role role) { if (!roles.contains(role)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "missing permission: " + role); }

    /**
     * D-06 deliberately maps the sole {@link Role#ADMIN} product role to the stationmaster
     * (super administrator). There is no second, lower-privilege administrator role.
     */
    public void requireSuperAdministrator() {
        if (!roles.contains(Role.ADMIN)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "super administrator permission required");
        }
    }
}
