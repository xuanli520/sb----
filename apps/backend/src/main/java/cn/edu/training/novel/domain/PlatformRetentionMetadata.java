package cn.edu.training.novel.domain;

import java.time.LocalDate;

/** Reporting semantics are returned with every response so rates cannot be misread. */
public record PlatformRetentionMetadata(
        LocalDate from,
        LocalDate to,
        LocalDate asOf,
        String timeZone,
        String cohortDefinition,
        String day1Definition,
        String day7Definition,
        String channelAttributionDefinition,
        String privacyBoundary) {
    public static final String REPORTING_TIME_ZONE = "Asia/Shanghai";
    public static final String COHORT_DEFINITION = "FIRST_READING_PROGRESS_ACTIVITY_DATE_PER_READER";
    public static final String DAY_1_DEFINITION = "ANY_READING_PROGRESS_ACTIVITY_ON_COHORT_DATE_PLUS_1";
    public static final String DAY_7_DEFINITION = "ANY_READING_PROGRESS_ACTIVITY_ON_COHORT_DATE_PLUS_7";
    public static final String CHANNEL_ATTRIBUTION_DEFINITION = "FIRST_TOUCH_REGISTRATION_CHANNEL; MISSING_ATTRIBUTION_IS_DIRECT";
    public static final String PRIVACY_BOUNDARY = "STORES_CONTROLLED_CHANNEL_CATEGORY_ONLY; NO_IP_REFERRER_URL_OR_DEVICE_FINGERPRINT";
}
