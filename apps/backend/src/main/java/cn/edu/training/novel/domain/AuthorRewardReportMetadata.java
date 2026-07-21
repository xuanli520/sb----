package cn.edu.training.novel.domain;

import java.time.LocalDate;

/** Stable interpretation metadata for an author reward report response. */
public record AuthorRewardReportMetadata(
        long total,
        int page,
        int size,
        Long bookId,
        LocalDate from,
        LocalDate to,
        String timeZone,
        String dateBoundary,
        String recordInclusion) {
    public static final String REPORTING_TIME_ZONE = "Asia/Shanghai";
    public static final String DATE_BOUNDARY = "FROM_INCLUSIVE_TO_INCLUSIVE";
    public static final String RECORD_INCLUSION = "SUCCESSFUL_BOOK_REWARD_DEBIT_ONLY";

    public AuthorRewardReportMetadata {
        if (total < 0 || page < 0 || size < 1) {
            throw new IllegalArgumentException("invalid reward report page metadata");
        }
        if (!REPORTING_TIME_ZONE.equals(timeZone)
                || !DATE_BOUNDARY.equals(dateBoundary)
                || !RECORD_INCLUSION.equals(recordInclusion)) {
            throw new IllegalArgumentException("invalid reward report metadata");
        }
    }
}
