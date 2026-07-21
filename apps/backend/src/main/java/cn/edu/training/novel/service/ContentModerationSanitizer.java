package cn.edu.training.novel.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.regex.Pattern;

/** Keeps model diagnostics useful without turning the audit database into a secret or content log. */
final class ContentModerationSanitizer {
    private static final Pattern AUTHORIZATION_HEADER = Pattern.compile(
            "(?i)\\bauthorization\\s*[:=]\\s*[^,;]+");
    private static final Pattern API_KEY_VALUE = Pattern.compile(
            "(?i)(api[_-]?key|bearer)\\s*[:=]\\s*[^\\s,;]{4,}");
    private static final Pattern BEARER_TOKEN = Pattern.compile("(?i)\\bbearer\\s+[^\\s,;]{4,}");
    private static final Pattern OPENAI_STYLE_KEY = Pattern.compile("\\bsk-[A-Za-z0-9_-]{8,}\\b");

    private ContentModerationSanitizer() {
    }

    static String bounded(String value, int limit) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value
                .replaceAll("[\\p{Cntrl}&&[^\\r\\n\\t]]", " ")
                .replace('\r', ' ')
                .replace('\n', ' ')
                .replace('\t', ' ')
                .replaceAll("\\s+", " ")
                .trim();
        // Handle the complete authorization header first so a generic key-value replacement
        // cannot leave an opaque bearer token behind.
        normalized = AUTHORIZATION_HEADER.matcher(normalized).replaceAll("Authorization: [REDACTED]");
        normalized = BEARER_TOKEN.matcher(normalized).replaceAll("Bearer [REDACTED]");
        normalized = API_KEY_VALUE.matcher(normalized).replaceAll("$1=[REDACTED]");
        normalized = OPENAI_STYLE_KEY.matcher(normalized).replaceAll("[REDACTED]");
        if (normalized.length() <= limit) {
            return normalized;
        }
        return normalized.substring(0, Math.max(0, limit - 18)) + " [TRUNCATED]";
    }

    /** Invalid model output is represented by a digest, never by an unbounded echoed chapter body. */
    static String digestMarker(String value) {
        return "sha256:" + sha256(value == null ? "" : value);
    }

    /** Provider exceptions can contain request bodies; retain only a stable diagnostic fingerprint. */
    static String safeExceptionSummary(Throwable exception) {
        String type = exception == null ? "Unknown" : exception.getClass().getSimpleName();
        String message = exception == null || exception.getMessage() == null ? "" : exception.getMessage();
        return "provider-error=" + bounded(type, 128) + "; message-sha256:" + sha256(message);
    }

    static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte byteValue : digest) {
                result.append(String.format(Locale.ROOT, "%02x", byteValue));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
