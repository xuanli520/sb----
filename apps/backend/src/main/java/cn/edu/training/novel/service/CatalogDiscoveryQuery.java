package cn.edu.training.novel.service;

/**
 * Normalized public-catalog constraints. Values are bounded before they reach the JDBC read
 * model so a public search request cannot turn into an unbounded database parameter.
 */
public record CatalogDiscoveryQuery(
        String query,
        String category,
        String serialStatus,
        Integer minWords,
        Integer maxWords) {
    private static final int MAX_QUERY_LENGTH = 100;
    private static final int MAX_CATEGORY_LENGTH = 128;
    private static final int MAX_SERIAL_STATUS_LENGTH = 32;

    public CatalogDiscoveryQuery {
        query = bounded(query, MAX_QUERY_LENGTH);
        category = bounded(category, MAX_CATEGORY_LENGTH);
        serialStatus = bounded(serialStatus, MAX_SERIAL_STATUS_LENGTH);
        minWords = normalizeWordCount(minWords);
        maxWords = normalizeWordCount(maxWords);
    }

    private static String bounded(String value, int maximumLength) {
        if (value == null) {
            return "";
        }
        String normalized = value.trim();
        return normalized.length() <= maximumLength ? normalized : normalized.substring(0, maximumLength);
    }

    private static Integer normalizeWordCount(Integer value) {
        if (value == null) {
            return null;
        }
        return Math.max(0, value);
    }
}
