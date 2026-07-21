package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AuthorRewardReport;
import cn.edu.training.novel.domain.AuthorRewardReportMetadata;
import cn.edu.training.novel.domain.AuthorRewardSummary;
import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.Role;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.NoSuchElementException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Author-scoped read service for rewards. Query dates are calendar days in {@value #REPORTING_ZONE}
 * and both boundaries are inclusive. Totals are platform-token totals over the complete filtered
 * result set; this service does not model a fiat-currency payout.
 */
@Service
public class AuthorRewardReportService {
    public static final String REPORTING_ZONE = "Asia/Shanghai";
    private static final ZoneId REPORTING_ZONE_ID = ZoneId.of(REPORTING_ZONE);
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_PAGE = 100_000;

    private final AuthorRewardRepository rewardRepository;
    private final CatalogRepository catalogRepository;

    public AuthorRewardReportService(AuthorRewardRepository rewardRepository, CatalogRepository catalogRepository) {
        this.rewardRepository = rewardRepository;
        this.catalogRepository = catalogRepository;
    }

    @Transactional(readOnly = true)
    public AuthorRewardReport report(
            CurrentUser actor,
            Long bookId,
            LocalDate from,
            LocalDate to,
            int page,
            int size) {
        actor.require(Role.AUTHOR);
        validatePage(page, size);
        validateDates(from, to);
        requireOwnedBookWhenFiltered(actor.id(), bookId);

        int offset;
        try {
            offset = Math.multiplyExact(page, size);
        } catch (ArithmeticException exception) {
            throw badRequest("page is out of range");
        }
        AuthorRewardRepository.QueryResult records = rewardRepository.findSuccessfulRewards(
                new AuthorRewardRepository.RewardFilter(
                        actor.id(),
                        bookId,
                        startOfDay(from),
                        startOfNextDay(to),
                        size,
                        offset));
        return new AuthorRewardReport(
                records.items(),
                new AuthorRewardSummary(records.total(), records.totalTokens(), AuthorRewardSummary.TOKEN),
                new AuthorRewardReportMetadata(
                        records.total(),
                        page,
                        size,
                        bookId,
                        from,
                        to,
                        AuthorRewardReportMetadata.REPORTING_TIME_ZONE,
                        AuthorRewardReportMetadata.DATE_BOUNDARY,
                        AuthorRewardReportMetadata.RECORD_INCLUSION));
    }

    private void requireOwnedBookWhenFiltered(long authorId, Long bookId) {
        if (bookId == null) {
            return;
        }
        if (bookId <= 0) {
            throw badRequest("book id must be positive");
        }
        Book book = catalogRepository.findById(bookId)
                .orElseThrow(() -> new NoSuchElementException("book not found"));
        if (book.authorId() != authorId) {
            throw new SecurityException("resource does not belong to current author");
        }
    }

    private static void validatePage(int page, int size) {
        if (page < 0 || page > MAX_PAGE || size < 1 || size > MAX_PAGE_SIZE) {
            throw badRequest("page or size is out of range");
        }
    }

    private static void validateDates(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw badRequest("from date must not be after to date");
        }
    }

    private static Instant startOfDay(LocalDate date) {
        return date == null ? null : date.atStartOfDay(REPORTING_ZONE_ID).toInstant();
    }

    private static Instant startOfNextDay(LocalDate date) {
        if (date == null) {
            return null;
        }
        try {
            return date.plusDays(1).atStartOfDay(REPORTING_ZONE_ID).toInstant();
        } catch (DateTimeException exception) {
            throw badRequest("to date is out of range");
        }
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
