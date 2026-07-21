package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AuthorAnalyticsAvailability;
import cn.edu.training.novel.domain.AuthorAnalyticsBookMetric;
import cn.edu.training.novel.domain.AuthorAnalyticsMetadata;
import cn.edu.training.novel.domain.AuthorAnalyticsMetricAvailability;
import cn.edu.training.novel.domain.AuthorAnalyticsReport;
import cn.edu.training.novel.domain.AuthorAnalyticsRetentionMetrics;
import cn.edu.training.novel.domain.AuthorAnalyticsSummary;
import cn.edu.training.novel.domain.AuthorAnalyticsSubscriptionMetrics;
import cn.edu.training.novel.domain.AuthorAnalyticsTrendPoint;
import cn.edu.training.novel.domain.Role;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Builds a bounded author dashboard from durable shelf, entitlement, ledger and reading-progress
 * rows, author-attributed membership grants, and immutable reader activity. Every source is
 * scoped to the current author's present catalog ownership before aggregation.
 */
@Service
public class AuthorAnalyticsService {
    public static final String REPORTING_ZONE = "Asia/Shanghai";
    public static final int DEFAULT_WINDOW_DAYS = 28;
    public static final int MAXIMUM_WINDOW_DAYS = 90;
    public static final int DEFAULT_BOOK_METRIC_LIMIT = 12;
    public static final int MAXIMUM_BOOK_METRIC_LIMIT = 50;

    private static final ZoneId REPORTING_ZONE_ID = ZoneId.of(REPORTING_ZONE);
    private static final AuthorAnalyticsAvailability AVAILABILITY = new AuthorAnalyticsAvailability(
            AuthorAnalyticsMetricAvailability.available(
                    "Author-attributed membership redemption ledger is available."),
            AuthorAnalyticsMetricAvailability.available(
                    "Immutable reader-work reading-progress activity is available."));

    private final AuthorAnalyticsRepository repository;

    public AuthorAnalyticsService(AuthorAnalyticsRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public AuthorAnalyticsReport report(
            CurrentUser actor,
            Long bookId,
            LocalDate from,
            LocalDate to,
            int bookMetricLimit) {
        actor.require(Role.AUTHOR);
        if (bookId != null && !repository.ownsBook(actor.id(), bookId)) {
            throw new SecurityException("resource does not belong to current author");
        }
        validateBookMetricLimit(bookMetricLimit);
        DateRange range = resolveRange(from, to);
        AuthorAnalyticsRepository.AnalyticsFilter filter = new AuthorAnalyticsRepository.AnalyticsFilter(
                actor.id(),
                bookId,
                range.fromInclusive(),
                range.toExclusive());

        List<AuthorAnalyticsRepository.TimedBookRow> shelfAdds = repository.findShelfAdds(filter);
        List<AuthorAnalyticsRepository.PurchaseRow> purchases = repository.findSuccessfulPurchases(filter);
        List<AuthorAnalyticsRepository.SubscriptionRow> subscriptions = repository.findAuthorAttributedSubscriptions(filter);
        List<AuthorAnalyticsRepository.ProgressRow> progressRows = repository.findCurrentProgress(filter);
        LocalDate observedThrough = range.to().isAfter(LocalDate.now(REPORTING_ZONE_ID))
                ? LocalDate.now(REPORTING_ZONE_ID)
                : range.to();
        List<AuthorAnalyticsRepository.RetentionActivityRow> retentionActivities =
                observedThrough.isBefore(range.from())
                        ? List.of()
                        : repository.findRetentionActivities(filter, observedThrough, range.from(), range.to());

        Map<LocalDate, TrendTotals> trend = initializedTrend(range.from(), range.to());
        Map<Long, Long> favoritesByBook = countsByBook(repository.countCurrentFavoritesByBook(filter));
        Map<Long, PurchaseTotals> purchasesByBook = new HashMap<>();
        PurchaseTotals purchaseTotals = new PurchaseTotals();
        for (AuthorAnalyticsRepository.TimedBookRow shelfAdd : shelfAdds) {
            trend.get(reportingDate(shelfAdd.recordedAt())).favoriteAddCount++;
        }
        for (AuthorAnalyticsRepository.PurchaseRow purchase : purchases) {
            TrendTotals daily = trend.get(reportingDate(purchase.acquiredAt()));
            daily.purchaseCount++;
            daily.purchaseTokenAmount += purchase.tokenAmount();
            purchaseTotals.purchaseCount++;
            purchaseTotals.purchaseTokenAmount += purchase.tokenAmount();
            PurchaseTotals perBook = purchasesByBook.computeIfAbsent(purchase.bookId(), ignored -> new PurchaseTotals());
            perBook.purchaseCount++;
            perBook.purchaseTokenAmount += purchase.tokenAmount();
        }

        SubscriptionTotals subscriptionTotals = new SubscriptionTotals();
        for (AuthorAnalyticsRepository.SubscriptionRow subscription : subscriptions) {
            subscriptionTotals.add(subscription.readerUserId(), subscription.membershipDays());
        }

        ReadThroughTotals readThroughTotals = new ReadThroughTotals();
        Map<Long, ReadThroughTotals> readThroughByBook = new HashMap<>();
        for (AuthorAnalyticsRepository.ProgressRow progress : progressRows) {
            double fraction = readThroughFraction(progress);
            readThroughTotals.add(progress.userId(), fraction);
            readThroughByBook.computeIfAbsent(progress.bookId(), ignored -> new ReadThroughTotals())
                    .add(progress.userId(), fraction);
        }

        RetentionTotals retentionTotals = new RetentionTotals();
        Map<ReaderBookKey, RetentionCohort> retentionCohorts = new HashMap<>();
        for (AuthorAnalyticsRepository.RetentionActivityRow activity : retentionActivities) {
            ReaderBookKey key = new ReaderBookKey(activity.userId(), activity.bookId());
            RetentionCohort cohort = retentionCohorts.computeIfAbsent(
                    key, ignored -> new RetentionCohort(activity.cohortDate()));
            cohort.activityDates.add(activity.activityDate());
        }
        for (RetentionCohort cohort : retentionCohorts.values()) {
            retentionTotals.add(cohort, observedThrough);
        }

        long ownedBookCount = repository.countOwnedBooks(filter);
        List<AuthorAnalyticsRepository.BookRef> books = repository.findBooks(filter, bookMetricLimit);
        List<AuthorAnalyticsBookMetric> bookMetrics = new ArrayList<>(books.size());
        for (AuthorAnalyticsRepository.BookRef book : books) {
            PurchaseTotals bookPurchases = purchasesByBook.get(book.id());
            ReadThroughTotals bookReadThrough = readThroughByBook.get(book.id());
            bookMetrics.add(new AuthorAnalyticsBookMetric(
                    book.id(),
                    book.title(),
                    favoritesByBook.getOrDefault(book.id(), 0L),
                    bookPurchases == null ? 0 : bookPurchases.purchaseCount,
                    bookPurchases == null ? 0 : bookPurchases.purchaseTokenAmount,
                    bookReadThrough == null ? 0 : bookReadThrough.readerBookCount,
                    bookReadThrough == null ? 0 : bookReadThrough.averagePercent()));
        }

        List<AuthorAnalyticsTrendPoint> dailyTrend = new ArrayList<>(trend.size());
        for (Map.Entry<LocalDate, TrendTotals> entry : trend.entrySet()) {
            TrendTotals totals = entry.getValue();
            dailyTrend.add(new AuthorAnalyticsTrendPoint(
                    entry.getKey(),
                    totals.favoriteAddCount,
                    totals.purchaseCount,
                    totals.purchaseTokenAmount));
        }

        return new AuthorAnalyticsReport(
                new AuthorAnalyticsSummary(
                        repository.countCurrentFavorites(filter),
                        purchaseTotals.purchaseCount,
                        purchaseTotals.purchaseTokenAmount,
                        readThroughTotals.readerBookCount,
                        readThroughTotals.uniqueReaders.size(),
                        readThroughTotals.completedReaderBookCount,
                        readThroughTotals.averagePercent(),
                        AuthorAnalyticsSummary.TOKEN),
                dailyTrend,
                bookMetrics,
                subscriptionTotals.toMetrics(),
                retentionTotals.toMetrics(observedThrough),
                AVAILABILITY,
                new AuthorAnalyticsMetadata(
                        range.from(),
                        range.to(),
                        AuthorAnalyticsMetadata.REPORTING_TIME_ZONE,
                        AuthorAnalyticsMetadata.DATE_BOUNDARY,
                        MAXIMUM_WINDOW_DAYS,
                        ownedBookCount,
                        bookMetricLimit,
                        ownedBookCount > books.size(),
                        AuthorAnalyticsMetadata.SHELF_TREND_INCLUSION,
                        AuthorAnalyticsMetadata.PURCHASE_INCLUSION,
                        AuthorAnalyticsMetadata.READ_THROUGH_DEFINITION,
                        AuthorAnalyticsMetadata.SUBSCRIPTION_INCLUSION,
                        AuthorAnalyticsMetadata.RETENTION_DEFINITION));
    }

    private static Map<Long, Long> countsByBook(List<AuthorAnalyticsRepository.BookCount> rows) {
        Map<Long, Long> result = new HashMap<>();
        for (AuthorAnalyticsRepository.BookCount row : rows) {
            result.put(row.bookId(), row.count());
        }
        return result;
    }

    private static Map<LocalDate, TrendTotals> initializedTrend(LocalDate from, LocalDate to) {
        Map<LocalDate, TrendTotals> trend = new LinkedHashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            trend.put(date, new TrendTotals());
        }
        return trend;
    }

    private static LocalDate reportingDate(Instant instant) {
        return instant.atZone(REPORTING_ZONE_ID).toLocalDate();
    }

    private static double readThroughFraction(AuthorAnalyticsRepository.ProgressRow progress) {
        if (progress.publishedChapterCount() <= 0 || progress.chapterPosition() <= 0) {
            return 0;
        }
        double characterFraction = progress.chapterCharacterCount() <= 0
                ? 0
                : Math.min(1, Math.max(0, (double) progress.characterOffset() / progress.chapterCharacterCount()));
        double fraction = ((progress.chapterPosition() - 1) + characterFraction) / progress.publishedChapterCount();
        return Math.min(1, Math.max(0, fraction));
    }

    private static DateRange resolveRange(LocalDate from, LocalDate to) {
        if ((from == null) != (to == null)) {
            throw badRequest("from and to must be supplied together");
        }
        LocalDate resolvedTo = to == null ? LocalDate.now(REPORTING_ZONE_ID) : to;
        LocalDate resolvedFrom;
        try {
            resolvedFrom = from == null ? resolvedTo.minusDays(DEFAULT_WINDOW_DAYS - 1L) : from;
        } catch (DateTimeException exception) {
            throw badRequest("date range is out of range");
        }
        if (resolvedFrom.isAfter(resolvedTo)) {
            throw badRequest("from date must not be after to date");
        }
        long days = ChronoUnit.DAYS.between(resolvedFrom, resolvedTo) + 1;
        if (days > MAXIMUM_WINDOW_DAYS) {
            throw badRequest("date range must not exceed " + MAXIMUM_WINDOW_DAYS + " calendar days");
        }
        try {
            return new DateRange(
                    resolvedFrom,
                    resolvedTo,
                    resolvedFrom.atStartOfDay(REPORTING_ZONE_ID).toInstant(),
                    resolvedTo.plusDays(1).atStartOfDay(REPORTING_ZONE_ID).toInstant());
        } catch (DateTimeException exception) {
            throw badRequest("date range is out of range");
        }
    }

    private static void validateBookMetricLimit(int bookMetricLimit) {
        if (bookMetricLimit < 1 || bookMetricLimit > MAXIMUM_BOOK_METRIC_LIMIT) {
            throw badRequest("book metric limit is out of range");
        }
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record DateRange(LocalDate from, LocalDate to, Instant fromInclusive, Instant toExclusive) {}

    private static final class TrendTotals {
        private long favoriteAddCount;
        private long purchaseCount;
        private long purchaseTokenAmount;
    }

    private static final class PurchaseTotals {
        private long purchaseCount;
        private long purchaseTokenAmount;
    }

    private static final class ReadThroughTotals {
        private long readerBookCount;
        private long completedReaderBookCount;
        private double fractionTotal;
        private final Set<Long> uniqueReaders = new HashSet<>();

        private void add(long userId, double fraction) {
            readerBookCount++;
            fractionTotal += fraction;
            uniqueReaders.add(userId);
            if (fraction >= 1) {
                completedReaderBookCount++;
            }
        }

        private double averagePercent() {
            if (readerBookCount == 0) {
                return 0;
            }
            return Math.round((fractionTotal / readerBookCount) * 10_000D) / 100D;
        }
    }

    private static final class SubscriptionTotals {
        private long attributedGrantCount;
        private long membershipDayCount;
        private final Set<Long> readerIds = new HashSet<>();

        private void add(long readerUserId, int membershipDays) {
            attributedGrantCount++;
            membershipDayCount += membershipDays;
            readerIds.add(readerUserId);
        }

        private AuthorAnalyticsSubscriptionMetrics toMetrics() {
            return new AuthorAnalyticsSubscriptionMetrics(
                    attributedGrantCount, readerIds.size(), membershipDayCount);
        }
    }

    private record ReaderBookKey(long userId, long bookId) {}

    private static final class RetentionCohort {
        private final LocalDate cohortDate;
        private final Set<LocalDate> activityDates = new HashSet<>();

        private RetentionCohort(LocalDate cohortDate) {
            this.cohortDate = cohortDate;
        }
    }

    private static final class RetentionTotals {
        private long cohortReaderBookCount;
        private long day1EligibleReaderBookCount;
        private long day1RetainedReaderBookCount;
        private long day7EligibleReaderBookCount;
        private long day7RetainedReaderBookCount;

        private void add(RetentionCohort cohort, LocalDate observedThrough) {
            cohortReaderBookCount++;
            LocalDate day1 = cohort.cohortDate.plusDays(1);
            LocalDate day7 = cohort.cohortDate.plusDays(7);
            if (!day1.isAfter(observedThrough)) {
                day1EligibleReaderBookCount++;
                if (cohort.activityDates.contains(day1)) {
                    day1RetainedReaderBookCount++;
                }
            }
            if (!day7.isAfter(observedThrough)) {
                day7EligibleReaderBookCount++;
                if (cohort.activityDates.contains(day7)) {
                    day7RetainedReaderBookCount++;
                }
            }
        }

        private AuthorAnalyticsRetentionMetrics toMetrics(LocalDate observedThrough) {
            return new AuthorAnalyticsRetentionMetrics(
                    cohortReaderBookCount,
                    day1EligibleReaderBookCount,
                    day1RetainedReaderBookCount,
                    percentage(day1RetainedReaderBookCount, day1EligibleReaderBookCount),
                    day7EligibleReaderBookCount,
                    day7RetainedReaderBookCount,
                    percentage(day7RetainedReaderBookCount, day7EligibleReaderBookCount),
                    observedThrough);
        }

        private static Double percentage(long retained, long eligible) {
            return eligible == 0 ? null : retained * 100.0 / eligible;
        }
    }
}
