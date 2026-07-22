package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Role;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public record CurrentUser(long id, String name, Set<Role> roles, boolean passwordChangeRequired) {
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
