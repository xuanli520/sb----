package cn.edu.training.novel.service;

import cn.edu.training.novel.config.BootstrapAdminProperties;
import cn.edu.training.novel.domain.Role;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Persists account credentials and BFF-session mappings. The browser only receives the BFF
 * session secret; the backend accepts it only from a caller that also holds the internal key.
 */
@Service
public class AuthService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder;
    private final String absentAccountHash;
    private final Duration sessionTtl;

    public AuthService(
            JdbcTemplate jdbc,
            @Value("${novel.auth.bcrypt-strength:12}") int bcryptStrength,
            @Value("${novel.auth.session-ttl:PT8H}") Duration sessionTtl) {
        this.jdbc = jdbc;
        this.passwordEncoder = new BCryptPasswordEncoder(bcryptStrength);
        this.absentAccountHash = passwordEncoder.encode("not-a-real-password");
        this.sessionTtl = sessionTtl;
    }

    @Transactional
    public AuthenticatedSession register(String username, String displayName, String password) {
        String loginName = normalizeLoginName(username);
        if (findAccountByLoginName(loginName).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "login name is already registered");
        }
        long accountId;
        try {
            KeyHolder keyHolder = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO novel_account(login_name, display_name, password_hash, roles, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                        Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, loginName);
                statement.setString(2, displayName.trim());
                statement.setString(3, passwordEncoder.encode(password));
                statement.setString(4, Role.READER.name());
                return statement;
            }, keyHolder);
            accountId = requireKey(keyHolder);
        } catch (DataIntegrityViolationException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "login name is already registered");
        }
        return createBffSession(new AccountRow(accountId, loginName, displayName.trim(), "", Set.of(Role.READER), true));
    }

    @Transactional
    public AuthenticatedSession login(String username, String password) {
        Optional<AccountRow> candidate = findAccountByLoginName(normalizeLoginName(username));
        if (candidate.isEmpty()) {
            passwordEncoder.matches(password, absentAccountHash);
            throw invalidCredentials();
        }
        AccountRow account = candidate.get();
        if (!account.enabled() || !passwordEncoder.matches(password, account.passwordHash())) {
            throw invalidCredentials();
        }
        return createBffSession(account);
    }

    public Optional<CurrentUser> resolveBffSession(String opaqueSessionId) {
        if (opaqueSessionId == null || opaqueSessionId.isBlank()) return Optional.empty();
        List<CurrentUser> users = jdbc.query(
                "SELECT a.id, a.display_name, a.roles "
                        + "FROM novel_bff_session b "
                        + "JOIN novel_login_session s ON s.id = b.login_session_id "
                        + "JOIN novel_account a ON a.id = s.account_id "
                        + "WHERE b.session_hash = ? AND b.revoked_at IS NULL AND s.revoked_at IS NULL "
                        + "AND b.expires_at > CURRENT_TIMESTAMP AND s.expires_at > CURRENT_TIMESTAMP AND a.enabled = TRUE",
                (resultSet, rowNumber) -> new CurrentUser(
                        resultSet.getLong("id"), resultSet.getString("display_name"), parseRoles(resultSet.getString("roles"))),
                hash(opaqueSessionId));
        return users.stream().findFirst();
    }

    @Transactional
    public void logoutBffSession(String opaqueSessionId) {
        if (opaqueSessionId == null || opaqueSessionId.isBlank()) return;
        String hash = hash(opaqueSessionId);
        List<Long> loginSessionIds = jdbc.query(
                "SELECT login_session_id FROM novel_bff_session WHERE session_hash = ? AND revoked_at IS NULL",
                (resultSet, rowNumber) -> resultSet.getLong(1), hash);
        jdbc.update("UPDATE novel_bff_session SET revoked_at = CURRENT_TIMESTAMP WHERE session_hash = ? AND revoked_at IS NULL", hash);
        for (Long loginSessionId : loginSessionIds) {
            jdbc.update("UPDATE novel_login_session SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL", loginSessionId);
        }
    }

    @Transactional
    public boolean setEnabled(long accountId, boolean enabled) {
        int updated = jdbc.update(
                "UPDATE novel_account SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                enabled,
                accountId);
        if (updated != 1) {
            throw new java.util.NoSuchElementException("account not found");
        }
        if (!enabled) {
            jdbc.update("UPDATE novel_login_session SET revoked_at = CURRENT_TIMESTAMP WHERE account_id = ? AND revoked_at IS NULL", accountId);
        }
        return enabled;
    }

    /**
     * Account enablement is the only persisted source of a real user's lifecycle state. Absent
     * account rows are allowed for explicit development identities and legacy test principals.
     */
    public void requireEnabled(long accountId) {
        List<Boolean> states = jdbc.query(
                "SELECT enabled FROM novel_account WHERE id = ?",
                (resultSet, rowNumber) -> resultSet.getBoolean(1),
                accountId);
        if (!states.isEmpty() && !states.getFirst()) {
            throw new SecurityException("account is disabled");
        }
    }

    @Transactional
    public void grantRole(long accountId, Role role) {
        Optional<AccountRow> account = findAccountById(accountId);
        if (account.isEmpty()) return;
        Set<Role> roles = EnumSet.copyOf(account.get().roles());
        roles.add(role);
        jdbc.update("UPDATE novel_account SET roles = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", serializeRoles(roles), accountId);
    }

    /**
     * Creates the configured first administrator or adds {@link Role#ADMIN} to an existing account.
     * Existing credentials must match the deployment secret before any role or enablement change is
     * applied, so a typo or stale environment variable cannot take over an unrelated account.
     */
    @Transactional
    public BootstrapAdminResult bootstrapAdministrator(BootstrapAdminProperties.ConfiguredAdmin configuredAdmin) {
        String loginName = normalizeLoginName(configuredAdmin.username());
        Optional<AccountRow> existing = findAccountByLoginName(loginName);
        if (existing.isEmpty()) {
            try {
                jdbc.update(
                        "INSERT INTO novel_account(login_name, display_name, password_hash, roles, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                        loginName,
                        configuredAdmin.displayName(),
                        passwordEncoder.encode(configuredAdmin.password()),
                        serializeRoles(Set.of(Role.READER, Role.ADMIN)));
                return BootstrapAdminResult.CREATED;
            } catch (DataIntegrityViolationException ignored) {
                // Another application node may have initialized the same unique login concurrently.
                // Re-read it below and apply the same credential verification before any upgrade.
                existing = findAccountByLoginName(loginName);
                if (existing.isEmpty()) {
                    throw new IllegalStateException("configured bootstrap administrator could not be persisted");
                }
            }
        }

        AccountRow account = existing.orElseThrow();
        if (!passwordEncoder.matches(configuredAdmin.password(), account.passwordHash())) {
            throw new IllegalStateException(
                    "configured bootstrap administrator credentials do not match the existing account");
        }
        EnumSet<Role> upgradedRoles = EnumSet.noneOf(Role.class);
        upgradedRoles.addAll(account.roles());
        upgradedRoles.add(Role.ADMIN);
        boolean changed = !account.enabled()
                || !account.displayName().equals(configuredAdmin.displayName())
                || !upgradedRoles.equals(account.roles());
        if (!changed) {
            return BootstrapAdminResult.UNCHANGED;
        }
        jdbc.update(
                "UPDATE novel_account SET display_name = ?, roles = ?, enabled = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                configuredAdmin.displayName(),
                serializeRoles(upgradedRoles),
                account.id());
        return BootstrapAdminResult.UPGRADED;
    }

    private AuthenticatedSession createBffSession(AccountRow account) {
        Instant expiresAt = Instant.now().plus(sessionTtl);
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_login_session(account_id, expires_at, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, account.id());
            statement.setTimestamp(2, Timestamp.from(expiresAt));
            return statement;
        }, keyHolder);
        long loginSessionId = requireKey(keyHolder);
        String bffSessionId = randomToken();
        jdbc.update(
                "INSERT INTO novel_bff_session(session_hash, login_session_id, expires_at, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
                hash(bffSessionId), loginSessionId, Timestamp.from(expiresAt));
        return new AuthenticatedSession(bffSessionId, new CurrentUser(account.id(), account.displayName(), account.roles()), expiresAt);
    }

    private Optional<AccountRow> findAccountByLoginName(String loginName) {
        List<AccountRow> accounts = jdbc.query(
                "SELECT id, login_name, display_name, password_hash, roles, enabled FROM novel_account WHERE login_name = ?",
                (resultSet, rowNumber) -> new AccountRow(
                        resultSet.getLong("id"), resultSet.getString("login_name"), resultSet.getString("display_name"),
                        resultSet.getString("password_hash"), parseRoles(resultSet.getString("roles")), resultSet.getBoolean("enabled")),
                loginName);
        return accounts.stream().findFirst();
    }

    private Optional<AccountRow> findAccountById(long accountId) {
        List<AccountRow> accounts = jdbc.query(
                "SELECT id, login_name, display_name, password_hash, roles, enabled FROM novel_account WHERE id = ?",
                (resultSet, rowNumber) -> new AccountRow(
                        resultSet.getLong("id"), resultSet.getString("login_name"), resultSet.getString("display_name"),
                        resultSet.getString("password_hash"), parseRoles(resultSet.getString("roles")), resultSet.getBoolean("enabled")),
                accountId);
        return accounts.stream().findFirst();
    }

    private static String normalizeLoginName(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private static Set<Role> parseRoles(String serialized) {
        EnumSet<Role> roles = EnumSet.noneOf(Role.class);
        Arrays.stream(serialized.split(","))
                .filter(value -> !value.isBlank())
                .map(Role::valueOf)
                .forEach(roles::add);
        return Set.copyOf(roles);
    }

    private static String serializeRoles(Set<Role> roles) {
        return roles.stream().map(Role::name).sorted().reduce((left, right) -> left + "," + right).orElse(Role.READER.name());
    }

    private static long requireKey(KeyHolder keyHolder) {
        if (keyHolder.getKeyList().isEmpty()) throw new IllegalStateException("database did not return a generated key");
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object id = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(id instanceof Number key)) throw new IllegalStateException("database did not return a numeric generated key");
        return key.longValue();
    }

    private static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String hash(String value) {
        try {
            return java.util.HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "invalid credentials");
    }

    public record AuthenticatedSession(String bffSessionId, CurrentUser user, Instant expiresAt) {}

    public enum BootstrapAdminResult {
        CREATED,
        UPGRADED,
        UNCHANGED
    }

    private record AccountRow(long id, String loginName, String displayName, String passwordHash, Set<Role> roles, boolean enabled) {}
}
