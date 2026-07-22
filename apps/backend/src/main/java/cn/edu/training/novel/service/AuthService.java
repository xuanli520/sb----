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
    private static final Set<String> ACQUISITION_CHANNELS = Set.of(
            "DIRECT", "ORGANIC", "SEARCH", "WECHAT", "QQ", "DOUYIN", "XIAOHONGSHU", "INVITE");
    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder;
    private final String absentAccountHash;
    private final Duration sessionTtl;
    private final EmailVerificationService emailVerificationService;
    private final AuditTrail auditTrail;

    public AuthService(
            JdbcTemplate jdbc,
            @Value("${novel.auth.bcrypt-strength:12}") int bcryptStrength,
            @Value("${novel.auth.session-ttl:PT8H}") Duration sessionTtl,
            EmailVerificationService emailVerificationService,
            AuditTrail auditTrail) {
        this.jdbc = jdbc;
        this.passwordEncoder = new BCryptPasswordEncoder(bcryptStrength);
        this.absentAccountHash = passwordEncoder.encode("not-a-real-password");
        this.sessionTtl = sessionTtl;
        this.emailVerificationService = emailVerificationService;
        this.auditTrail = auditTrail;
    }

    /**
     * Trusted direct provisioning path for legacy migrations and server-side test fixtures. It is
     * not called by any browser-facing BFF controller, which uses {@link #registerFromBff}.
     */
    @Transactional
    public AuthenticatedSession register(String username, String displayName, String password) {
        return register(username, displayName, password, null);
    }

    /**
     * Persists only a server-controlled, first-touch acquisition category. Raw UTM URLs,
     * referrers, IP addresses and device identifiers are intentionally never accepted here.
     */
    @Transactional
    public AuthenticatedSession register(String username, String displayName, String password, String channel) {
        String loginName = normalizeLoginName(username);
        String normalizedChannel = normalizeAcquisitionChannel(channel);
        return registerNormalized(loginName, displayName, password, normalizedChannel);
    }

    /**
     * Internal BFF registration path. Email-shaped login names must prove current control of the
     * mailbox first; a non-email legacy username remains available for trusted internal fixtures
     * and migration data, but is not a browser registration option.
     */
    @Transactional
    public AuthenticatedSession registerFromBff(
            String username,
            String displayName,
            String password,
            String channel,
            String verificationCode) {
        String loginName = normalizeLoginName(username);
        String normalizedChannel = normalizeAcquisitionChannel(channel);
        if (!EmailVerificationService.isEmailAddress(loginName)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "an email address is required");
        }
        if (findAccountByLoginName(loginName).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "login name is already registered");
        }
        emailVerificationService.consumeRegistrationCode(loginName, verificationCode);
        return registerNormalized(loginName, displayName, password, normalizedChannel);
    }

    private AuthenticatedSession registerNormalized(
            String loginName,
            String displayName,
            String password,
            String normalizedChannel) {
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
        jdbc.update(
                "INSERT INTO novel_channel_attribution(user_id, channel, attribution_source, attributed_at) "
                        + "VALUES (?, ?, 'REGISTRATION', CURRENT_TIMESTAMP)",
                accountId,
                normalizedChannel);
        return createBffSession(new AccountRow(accountId, loginName, displayName.trim(), "", Set.of(Role.READER), true, false));
    }

    @Transactional
    public AuthenticatedSession login(String username, String password) {
        return loginNormalized(normalizeLoginName(username), password);
    }

    /** Browser/BFF login accepts email accounts only; no phone-login path is implemented. */
    @Transactional
    public AuthenticatedSession loginFromBff(String username, String password) {
        String loginName = normalizeLoginName(username);
        if (!EmailVerificationService.isEmailAddress(loginName)) {
            throw invalidCredentials();
        }
        return loginNormalized(loginName, password);
    }

    private AuthenticatedSession loginNormalized(String loginName, String password) {
        Optional<AccountRow> candidate = findAccountByLoginName(loginName);
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
                "SELECT a.id, a.display_name, a.roles, a.password_change_required "
                        + "FROM novel_bff_session b "
                        + "JOIN novel_login_session s ON s.id = b.login_session_id "
                        + "JOIN novel_account a ON a.id = s.account_id "
                        + "WHERE b.session_hash = ? AND b.revoked_at IS NULL AND s.revoked_at IS NULL "
                        + "AND b.expires_at > CURRENT_TIMESTAMP AND s.expires_at > CURRENT_TIMESTAMP AND a.enabled = TRUE",
                (resultSet, rowNumber) -> new CurrentUser(
                        resultSet.getLong("id"), resultSet.getString("display_name"), parseRoles(resultSet.getString("roles")),
                        resultSet.getBoolean("password_change_required")),
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
     * account rows are allowed only for legacy fixture principals.
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

    @Transactional
    public void changePassword(long accountId, String currentPassword, String newPassword) {
        AccountRow account = findAccountById(accountId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "authentication required"));
        if (!account.enabled() || !passwordEncoder.matches(currentPassword, account.passwordHash())) {
            throw invalidCredentials();
        }
        if (passwordEncoder.matches(newPassword, account.passwordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "new password must differ from current password");
        }
        jdbc.update(
                "UPDATE novel_account SET password_hash = ?, password_change_required = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                passwordEncoder.encode(newPassword), accountId);
        revokeAccountSessions(accountId);
        auditTrail.record("account-password-changed account=" + accountId);
    }

    /** Creates the first administrator only. Existing accounts are never implicitly elevated. */
    @Transactional
    public BootstrapAdminResult bootstrapAdministrator(BootstrapAdminProperties.ConfiguredAdmin configuredAdmin) {
        String loginName = normalizeLoginName(configuredAdmin.username());
        if (hasAdministrator()) return BootstrapAdminResult.UNCHANGED;
        Optional<AccountRow> existing = findAccountByLoginName(loginName);
        if (existing.isPresent()) {
            throw new IllegalStateException("configured bootstrap administrator username is already owned by a non-administrator account");
        }
        try {
            jdbc.update(
                    "INSERT INTO novel_account(login_name, display_name, password_hash, password_change_required, roles, enabled, created_at, updated_at) VALUES (?, ?, ?, TRUE, ?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    loginName,
                    configuredAdmin.displayName(),
                    passwordEncoder.encode(configuredAdmin.password()),
                    serializeRoles(Set.of(Role.READER, Role.ADMIN)));
            auditTrail.record("bootstrap-administrator-created account=" + loginName);
            return BootstrapAdminResult.CREATED;
        } catch (DataIntegrityViolationException exception) {
            if (hasAdministrator()) return BootstrapAdminResult.UNCHANGED;
            throw new IllegalStateException("configured bootstrap administrator could not be persisted", exception);
        }
    }

    @Transactional
    public String resetBootstrapAdministrator(BootstrapAdminProperties.ConfiguredAdmin configuredAdmin) {
        AccountRow account = findAccountByLoginName(normalizeLoginName(configuredAdmin.username()))
                .orElseThrow(() -> new IllegalStateException("configured bootstrap administrator does not exist"));
        if (!account.roles().contains(Role.ADMIN)) {
            throw new IllegalStateException("configured bootstrap administrator is not an administrator");
        }
        String password = generatedPassword();
        jdbc.update(
                "UPDATE novel_account SET password_hash = ?, password_change_required = TRUE, enabled = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                passwordEncoder.encode(password),
                account.id());
        revokeAccountSessions(account.id());
        auditTrail.record("bootstrap-administrator-password-reset account=" + account.id());
        return password;
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
        return new AuthenticatedSession(bffSessionId, new CurrentUser(account.id(), account.displayName(), account.roles(), account.passwordChangeRequired()), expiresAt);
    }

    private Optional<AccountRow> findAccountByLoginName(String loginName) {
        List<AccountRow> accounts = jdbc.query(
                "SELECT id, login_name, display_name, password_hash, password_change_required, roles, enabled FROM novel_account WHERE login_name = ?",
                (resultSet, rowNumber) -> new AccountRow(
                        resultSet.getLong("id"), resultSet.getString("login_name"), resultSet.getString("display_name"),
                        resultSet.getString("password_hash"), parseRoles(resultSet.getString("roles")), resultSet.getBoolean("enabled"), resultSet.getBoolean("password_change_required")),
                loginName);
        return accounts.stream().findFirst();
    }

    private Optional<AccountRow> findAccountById(long accountId) {
        List<AccountRow> accounts = jdbc.query(
                "SELECT id, login_name, display_name, password_hash, password_change_required, roles, enabled FROM novel_account WHERE id = ?",
                (resultSet, rowNumber) -> new AccountRow(
                        resultSet.getLong("id"), resultSet.getString("login_name"), resultSet.getString("display_name"),
                        resultSet.getString("password_hash"), parseRoles(resultSet.getString("roles")), resultSet.getBoolean("enabled"), resultSet.getBoolean("password_change_required")),
                accountId);
        return accounts.stream().findFirst();
    }

    private static String normalizeLoginName(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }

    private static String normalizeAcquisitionChannel(String channel) {
        if (channel == null || channel.isBlank()) {
            return "DIRECT";
        }
        String normalized = channel.trim().toUpperCase(Locale.ROOT);
        if (!ACQUISITION_CHANNELS.contains(normalized)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unsupported acquisition channel");
        }
        return normalized;
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

    public static String generatedPassword() {
        return randomToken();
    }

    private boolean hasAdministrator() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM novel_account WHERE roles LIKE ?", Integer.class, "%ADMIN%");
        return count != null && count > 0;
    }

    private void revokeAccountSessions(long accountId) {
        jdbc.update("UPDATE novel_login_session SET revoked_at = CURRENT_TIMESTAMP WHERE account_id = ? AND revoked_at IS NULL", accountId);
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

    private record AccountRow(long id, String loginName, String displayName, String passwordHash, Set<Role> roles, boolean enabled, boolean passwordChangeRequired) {}
}
