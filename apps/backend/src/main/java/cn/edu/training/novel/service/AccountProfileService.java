package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AccountEntitlements;
import cn.edu.training.novel.domain.AccountProfile;
import cn.edu.training.novel.domain.Role;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountProfileService {
    private static final int MAX_DISPLAY_NAME_CODE_POINTS = 128;

    private final JdbcTemplate jdbc;
    private final AuthService authService;
    private final AccountEntitlementRepository entitlementRepository;

    public AccountProfileService(
            JdbcTemplate jdbc,
            AuthService authService,
            AccountEntitlementRepository entitlementRepository) {
        this.jdbc = jdbc;
        this.authService = authService;
        this.entitlementRepository = entitlementRepository;
    }

    @Transactional(readOnly = true)
    public AccountProfile profileFor(CurrentUser actor) {
        authService.requireEnabled(actor.id());
        return enabledProfile(actor.id()).orElseGet(() -> {
            if (accountExists(actor.id())) {
                throw new SecurityException("account is disabled");
            }
            // Legacy fixture principals remain readable, but cannot acquire a durable name.
            return new AccountProfile(actor.id(), actor.name(), actor.roles(), actor.passwordChangeRequired());
        });
    }

    @Transactional
    public AccountProfile updateDisplayName(CurrentUser actor, String requestedName) {
        String displayName = normalizeDisplayName(requestedName);
        authService.requireEnabled(actor.id());
        int updated = jdbc.update(
                "UPDATE novel_account SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND enabled = TRUE",
                displayName,
                actor.id());
        if (updated != 1) {
            if (accountExists(actor.id())) {
                throw new SecurityException("account is disabled");
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "persistent account not found");
        }
        return enabledProfile(actor.id()).orElseThrow(() -> new SecurityException("account is disabled"));
    }

    @Transactional(readOnly = true)
    public AccountEntitlements entitlementsFor(CurrentUser actor) {
        authService.requireEnabled(actor.id());
        return entitlementRepository.findForUser(actor.id(), java.time.Instant.now());
    }

    private Optional<AccountProfile> enabledProfile(long accountId) {
        List<AccountProfile> profiles = jdbc.query(
                "SELECT id, display_name, roles, password_change_required FROM novel_account WHERE id = ? AND enabled = TRUE",
                (resultSet, rowNumber) -> new AccountProfile(
                        resultSet.getLong("id"),
                        resultSet.getString("display_name"),
                        parseRoles(resultSet.getString("roles")), resultSet.getBoolean("password_change_required")),
                accountId);
        return profiles.stream().findFirst();
    }

    private boolean accountExists(long accountId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_account WHERE id = ?",
                Integer.class,
                accountId);
        return count != null && count > 0;
    }

    private static String normalizeDisplayName(String requestedName) {
        if (requestedName == null) {
            throw invalidDisplayName("display name is required");
        }
        String normalized = requestedName.strip();
        int codePointCount = normalized.codePointCount(0, normalized.length());
        if (codePointCount == 0) {
            throw invalidDisplayName("display name must not be blank");
        }
        if (codePointCount > MAX_DISPLAY_NAME_CODE_POINTS) {
            throw invalidDisplayName("display name must be at most 128 characters");
        }
        if (normalized.codePoints().anyMatch(AccountProfileService::isForbiddenDisplayCharacter)) {
            throw invalidDisplayName("display name must not contain control characters or line breaks");
        }
        return normalized;
    }

    private static boolean isForbiddenDisplayCharacter(int codePoint) {
        int type = Character.getType(codePoint);
        return Character.isISOControl(codePoint)
                || type == Character.LINE_SEPARATOR
                || type == Character.PARAGRAPH_SEPARATOR;
    }

    private static ResponseStatusException invalidDisplayName(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static Set<Role> parseRoles(String serialized) {
        java.util.EnumSet<Role> roles = java.util.EnumSet.noneOf(Role.class);
        java.util.Arrays.stream(serialized.split(","))
                .filter(value -> !value.isBlank())
                .map(Role::valueOf)
                .forEach(roles::add);
        return Set.copyOf(roles);
    }
}
