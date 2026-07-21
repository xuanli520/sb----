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
        String shelfTrendInclusion,
        String purchaseInclusion,
        String readThroughDefinition,
        String subscriptionInclusion,
        String retentionDefinition) {
    public static final String REPORTING_TIME_ZONE = "Asia/Shanghai";
    public static final String DATE_BOUNDARY = "FROM_INCLUSIVE_TO_INCLUSIVE";
    public static final String SHELF_TREND_INCLUSION =
            "CURRENT_BOOKSHELF_ROWS_ADDED_IN_WINDOW; REMOVED_ROWS_ARE_NOT_RETAINED";
    public static final String PURCHASE_INCLUSION =
            "PURCHASE_ENTITLEMENT_WITH_MATCHING_BOOK_PURCHASE_TOKEN_DEBIT";
    public static final String READ_THROUGH_DEFINITION =
            "CURRENT_PROGRESS_UPDATED_IN_WINDOW; PUBLISHED_CHAPTER_POSITION_PLUS_CAPPED_OFFSET_FRACTION";
    public static final String SUBSCRIPTION_INCLUSION =
            "AUTHOR_ATTRIBUTED_MEMBERSHIP_REDEMPTION_LEDGER; COMPOSITE_REDEMPTION_CODE_BOOK_OWNER_SNAPSHOTTED_AT_GRANT";
    public static final String RETENTION_DEFINITION =
            "FIRST_READING_PROGRESS_ACTIVITY_DATE_PER_READER_BOOK; SAME_READER_BOOK_ACTIVITY_ON_COHORT_DATE_PLUS_1_OR_PLUS_7; ONLY_COHORTS_MATURED_BY_OBSERVED_THROUGH_ARE_ELIGIBLE";
}
