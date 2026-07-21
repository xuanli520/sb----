package cn.edu.training.novel.domain;

/** Makes unsupported dashboard metrics explicit instead of returning invented values. */
public record AuthorAnalyticsMetricAvailability(boolean available, String reason) {
    public static AuthorAnalyticsMetricAvailability available(String reason) {
        return new AuthorAnalyticsMetricAvailability(true, reason);
    }

    public static AuthorAnalyticsMetricAvailability unavailable(String reason) {
        return new AuthorAnalyticsMetricAvailability(false, reason);
    }
}
