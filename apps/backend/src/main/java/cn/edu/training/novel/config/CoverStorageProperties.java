package cn.edu.training.novel.config;

import java.net.URI;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Server-only object-storage settings for author cover uploads. The public URL is intentionally a
 * relative Nginx path; callers never receive an S3/MinIO endpoint or storage credential.
 */
@ConfigurationProperties(prefix = "novel.cover-storage")
public record CoverStorageProperties(
        boolean enabled,
        @DefaultValue("") String endpoint,
        @DefaultValue("") String accessKey,
        @DefaultValue("") String secretKey,
        @DefaultValue("novel-covers") String bucket,
        @DefaultValue("/media") String publicBasePath,
        @DefaultValue("5242880") long maxBytes,
        @DefaultValue("4096") int maxWidth,
        @DefaultValue("4096") int maxHeight) {
    private static final Pattern BUCKET = Pattern.compile("[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])?");

    public Optional<URI> storageEndpoint() {
        if (endpoint == null || endpoint.isBlank()) return Optional.empty();
        try {
            URI value = URI.create(endpoint.trim());
            if (("http".equalsIgnoreCase(value.getScheme()) || "https".equalsIgnoreCase(value.getScheme()))
                    && value.getHost() != null
                    && value.getUserInfo() == null
                    && (value.getRawPath() == null || value.getRawPath().isEmpty() || "/".equals(value.getRawPath()))
                    && value.getRawQuery() == null
                    && value.getRawFragment() == null) {
                return Optional.of(value);
            }
        } catch (IllegalArgumentException ignored) {
            // Invalid operator input is represented by the unavailable storage capability.
        }
        return Optional.empty();
    }

    public boolean isComplete() {
        return storageEndpoint().isPresent()
                && hasText(accessKey)
                && hasText(secretKey)
                && bucket != null
                && BUCKET.matcher(bucket).matches()
                && validPublicBasePath()
                && maxBytes >= 1024
                && maxWidth >= 1
                && maxHeight >= 1;
    }

    public String normalizedPublicBasePath() {
        if (!validPublicBasePath()) return "/media";
        String normalized = publicBasePath.trim();
        return normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized;
    }

    private boolean validPublicBasePath() {
        // Nginx, Next development proxying, and the public media controller all intentionally
        // share one small URL grammar. A configurable arbitrary path would split that contract.
        return publicBasePath != null && "/media".equals(publicBasePath.trim());
    }

    private static boolean hasText(String value) { return value != null && !value.isBlank(); }
}
