package cn.edu.training.novel.domain;

import java.time.LocalDate;

/** Published calculation contract for the author analytics response. */
public record AuthorAnalyticsMetadata(
        LocalDate from,
        LocalDate to,
        String timeZone,
        String dateBoundary,
        int maximumWindowDays,
        long bookMetricTotal,
        int returnedBookMetricLimit,
        boolean bookMetricsTruncated,
        String favoriteTrendInclusion,
        String purchaseInclusion,
        String readThroughDefinition,
        String activeReadingDefinition,
        String subscriptionInclusion,
        String membershipAttributionInclusion,
        String historicalObservationBoundary,
        String retentionDefinition) {
    public static final String REPORTING_TIME_ZONE = "Asia/Shanghai";
    public static final String DATE_BOUNDARY = "FROM_INCLUSIVE_TO_INCLUSIVE";
    public static final String FAVORITE_TREND_INCLUSION =
            "IMMUTABLE_FAVORITED_AND_UNFAVORITED_EVENTS; CURRENT_SHELF_ROWS_BACKFILLED_AS_FAVORITED_AT_V33_MIGRATION";
    public static final String PURCHASE_INCLUSION =
            "PURCHASE_ENTITLEMENT_WITH_MATCHING_BOOK_PURCHASE_TOKEN_DEBIT";
    public static final String READ_THROUGH_DEFINITION =
            "CURRENT_PROGRESS_FOR_PUBLISHED_CHAPTERS; PUBLISHED_CHAPTER_POSITION_PLUS_CAPPED_OFFSET_FRACTION";
    public static final String ACTIVE_READING_DEFINITION =
            "DISTINCT_READER_WORK_READING_PROGRESS_ACTIVITY_EVENTS_IN_SELECTED_SHANGHAI_DAYS";
    public static final String SUBSCRIPTION_INCLUSION =
            "FREE_WORK_SUBSCRIPTION_STATE_AND_IMMUTABLE_SUBSCRIBED_UNSUBSCRIBED_EVENTS";
    public static final String MEMBERSHIP_ATTRIBUTION_INCLUSION =
            "AUTHOR_ATTRIBUTED_MEMBERSHIP_REDEMPTION_LEDGER; COMPOSITE_REDEMPTION_CODE_BOOK_OWNER_SNAPSHOTTED_AT_GRANT";
    public static final String HISTORICAL_OBSERVATION_BOUNDARY =
            "MEMBERSHIP_ATTRIBUTION_STARTS_AT_V22; READING_ACTIVITY_AND_RETENTION_EVENTS_START_AT_V23; "
                    + "SUBSCRIPTION_EVENTS_START_AT_V33; FAVORITE_EVENT_HISTORY_BEFORE_V33_INCLUDES_ONLY_CURRENT_SHELF_BACKFILL; "
                    + "PRIOR_UNFAVORITES_ARE_NOT_OBSERVABLE";
    public static final String RETENTION_DEFINITION =
            "FIRST_READING_PROGRESS_ACTIVITY_DATE_PER_READER_BOOK; SAME_READER_BOOK_ACTIVITY_ON_COHORT_DATE_PLUS_1_OR_PLUS_7; ONLY_COHORTS_MATURED_BY_OBSERVED_THROUGH_ARE_ELIGIBLE";
}
