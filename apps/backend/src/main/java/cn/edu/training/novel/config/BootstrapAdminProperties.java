package cn.edu.training.novel.config;

import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Optional, deployment-owned credentials for creating the first production administrator.
 *
 * <p>Username and display name opt into first-administrator creation. Password is optional: when
 * blank, the server generates a one-time random password at initial creation.</p>
 */
@ConfigurationProperties(prefix = "novel.bootstrap-admin")
public final class BootstrapAdminProperties {
    private static final Pattern LOGIN_NAME = Pattern.compile("[A-Za-z0-9._@+-]{3,120}");

    private String username = "";
    private String displayName = "";
    private String password = "";
    private boolean resetPassword;

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public boolean isResetPassword() { return resetPassword; }

    public void setResetPassword(boolean resetPassword) { this.resetPassword = resetPassword; }

    /**
     * Returns the normalized administrator command only when the deployment has opted in.
     * Whitespace-only values and malformed credentials are rejected before any database write.
     */
    public Optional<ConfiguredAdmin> configuredAdmin() {
        String normalizedUsername = normalize(username);
        String normalizedDisplayName = normalize(displayName);
        String configuredPassword = password == null ? "" : password;
        boolean anyConfigured = !normalizedUsername.isEmpty()
                || !normalizedDisplayName.isEmpty()
                || !configuredPassword.isEmpty();
        if (!anyConfigured) {
            return Optional.empty();
        }
        if (normalizedUsername.isEmpty() || normalizedDisplayName.isEmpty()) {
            throw new IllegalStateException(
                    "novel.bootstrap-admin requires username and display-name together");
        }
        if (!LOGIN_NAME.matcher(normalizedUsername).matches()) {
            throw new IllegalStateException("novel.bootstrap-admin.username has an invalid format");
        }
        if (normalizedDisplayName.length() > 128) {
            throw new IllegalStateException("novel.bootstrap-admin.display-name must be at most 128 characters");
        }
        if (!configuredPassword.isBlank() && (configuredPassword.length() < 12 || configuredPassword.length() > 128)) {
            throw new IllegalStateException("novel.bootstrap-admin.password must contain 12 to 128 characters");
        }
        return Optional.of(new ConfiguredAdmin(normalizedUsername, normalizedDisplayName, configuredPassword));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    /** Does not expose its password through {@link #toString()}. */
    public static final class ConfiguredAdmin {
        private final String username;
        private final String displayName;
        private final String password;

        private ConfiguredAdmin(String username, String displayName, String password) {
            this.username = username;
            this.displayName = displayName;
            this.password = password;
        }

        public String username() {
            return username;
        }

        public String displayName() {
            return displayName;
        }

        public String password() {
            return password;
        }

        public ConfiguredAdmin withPassword(String value) {
            return new ConfiguredAdmin(username, displayName, value);
        }

        @Override
        public String toString() {
            return "ConfiguredAdmin[username=" + username + ", displayName=" + displayName + ", password=<redacted>]";
        }
    }
}
