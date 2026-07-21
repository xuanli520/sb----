package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.PlatformChannelRetention;
import cn.edu.training.novel.domain.PlatformRetentionDailyCohort;
import cn.edu.training.novel.domain.PlatformRetentionMetadata;
import cn.edu.training.novel.domain.PlatformRetentionReport;
import cn.edu.training.novel.domain.PlatformRetentionSummary;
import cn.edu.training.novel.domain.RetentionMetric;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Builds global and acquisition-channel retention reports from immutable reader activity. */
@Service
public class PlatformRetentionReportService {
    public static final String REPORTING_ZONE = "Asia/Shanghai";
    public static final int DEFAULT_WINDOW_DAYS = 28;
    public static final int MAXIMUM_WINDOW_DAYS = 90;
    private static final ZoneId REPORTING_ZONE_ID = ZoneId.of(REPORTING_ZONE);

    private final PlatformRetentionRepository repository;

    public PlatformRetentionReportService(PlatformRetentionRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public PlatformRetentionReport report(LocalDate from, LocalDate to, LocalDate asOf) {
        LocalDate today = LocalDate.now(REPORTING_ZONE_ID);
        LocalDate effectiveAsOf = asOf == null ? today : asOf;
        if (effectiveAsOf.isAfter(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "asOf must not be in the future");
        }
        DateRange range = resolveRange(from, to, effectiveAsOf);
        if (range.to().isAfter(effectiveAsOf)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "to must not be after asOf");
        }

        Map<Long, ReaderCohort> readers = new LinkedHashMap<>();
        for (PlatformRetentionRepository.CohortActivityRow row : repository.findCohortActivities(
                range.from(), range.to(), effectiveAsOf)) {
            ReaderCohort cohort = readers.computeIfAbsent(
                    row.userId(), ignored -> new ReaderCohort(row.cohortDate(), row.channel()));
            cohort.activityDates.add(row.activityDate());
        }

        Map<CohortKey, MutableMetric> daily = new TreeMap<>();
        Map<String, MutableMetric> channels = new TreeMap<>();
        MutableMetric overall = new MutableMetric();
        for (ReaderCohort reader : readers.values()) {
            MutableMetric dailyMetric = daily.computeIfAbsent(
                    new CohortKey(reader.cohortDate, reader.channel), ignored -> new MutableMetric());
            MutableMetric channelMetric = channels.computeIfAbsent(reader.channel, ignored -> new MutableMetric());
            dailyMetric.add(reader, effectiveAsOf);
            channelMetric.add(reader, effectiveAsOf);
            overall.add(reader, effectiveAsOf);
        }

        Map<String, Long> activeByChannel = new HashMap<>();
        for (PlatformRetentionRepository.ChannelActiveReaderRow row : repository.countActiveReadersByChannel(range.from(), range.to())) {
            activeByChannel.put(row.channel(), row.readerCount());
        }
        Set<String> channelNames = new LinkedHashSet<>();
        channelNames.addAll(channels.keySet());
        channelNames.addAll(activeByChannel.keySet());

        List<PlatformRetentionDailyCohort> dailyCohorts = new ArrayList<>(daily.size());
        for (Map.Entry<CohortKey, MutableMetric> entry : daily.entrySet()) {
            dailyCohorts.add(new PlatformRetentionDailyCohort(
                    entry.getKey().cohortDate, entry.getKey().channel, entry.getValue().toMetric()));
        }
        List<PlatformChannelRetention> channelReports = new ArrayList<>(channelNames.size());
        for (String channel : channelNames) {
            MutableMetric metric = channels.getOrDefault(channel, new MutableMetric());
            channelReports.add(new PlatformChannelRetention(
                    channel, activeByChannel.getOrDefault(channel, 0L), metric.toMetric()));
        }

        return new PlatformRetentionReport(
                new PlatformRetentionSummary(repository.countActiveReaders(range.from(), range.to()), overall.toMetric()),
                dailyCohorts,
                channelReports,
                new PlatformRetentionMetadata(
                        range.from(),
                        range.to(),
                        effectiveAsOf,
                        PlatformRetentionMetadata.REPORTING_TIME_ZONE,
                        PlatformRetentionMetadata.COHORT_DEFINITION,
                        PlatformRetentionMetadata.DAY_1_DEFINITION,
                        PlatformRetentionMetadata.DAY_7_DEFINITION,
                        PlatformRetentionMetadata.CHANNEL_ATTRIBUTION_DEFINITION,
                        PlatformRetentionMetadata.PRIVACY_BOUNDARY));
    }

    private static DateRange resolveRange(LocalDate from, LocalDate to, LocalDate asOf) {
        if ((from == null) != (to == null)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from and to must be supplied together");
        }
        LocalDate resolvedFrom = from == null ? asOf.minusDays(DEFAULT_WINDOW_DAYS - 1L) : from;
        LocalDate resolvedTo = to == null ? asOf : to;
        if (resolvedFrom.isAfter(resolvedTo)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
        long length = ChronoUnit.DAYS.between(resolvedFrom, resolvedTo) + 1;
        if (length > MAXIMUM_WINDOW_DAYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "date range must not exceed " + MAXIMUM_WINDOW_DAYS + " days");
        }
        return new DateRange(resolvedFrom, resolvedTo);
    }

    private record DateRange(LocalDate from, LocalDate to) {}
    private record CohortKey(LocalDate cohortDate, String channel) implements Comparable<CohortKey> {
        @Override public int compareTo(CohortKey other) {
            int date = cohortDate.compareTo(other.cohortDate);
            return date != 0 ? date : channel.compareTo(other.channel);
        }
    }
    private static final class ReaderCohort {
        private final LocalDate cohortDate;
        private final String channel;
        private final Set<LocalDate> activityDates = new LinkedHashSet<>();
        private ReaderCohort(LocalDate cohortDate, String channel) {
            this.cohortDate = cohortDate;
            this.channel = channel;
        }
    }
    private static final class MutableMetric {
        private long cohortReaders;
        private long day1Eligible;
        private long day1Retained;
        private long day7Eligible;
        private long day7Retained;

        private void add(ReaderCohort reader, LocalDate asOf) {
            cohortReaders++;
            LocalDate day1 = reader.cohortDate.plusDays(1);
            LocalDate day7 = reader.cohortDate.plusDays(7);
            if (!day1.isAfter(asOf)) {
                day1Eligible++;
                if (reader.activityDates.contains(day1)) day1Retained++;
            }
            if (!day7.isAfter(asOf)) {
                day7Eligible++;
                if (reader.activityDates.contains(day7)) day7Retained++;
            }
        }

        private RetentionMetric toMetric() {
            return new RetentionMetric(
                    cohortReaders,
                    day1Eligible,
                    day1Retained,
                    percent(day1Retained, day1Eligible),
                    day7Eligible,
                    day7Retained,
                    percent(day7Retained, day7Eligible));
        }

        private static Double percent(long retained, long eligible) {
            return eligible == 0 ? null : retained * 100.0 / eligible;
        }
    }
}
