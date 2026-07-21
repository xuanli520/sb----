package cn.edu.training.novel.service;

import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Read-only retention source queries.  Aggregation stays in Java to keep date semantics portable
 * between H2 and MySQL and to make the as-of eligibility rule explicit. */
@Repository
public class PlatformRetentionRepository {
    private final JdbcTemplate jdbc;

    public PlatformRetentionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<CohortActivityRow> findCohortActivities(LocalDate from, LocalDate to, LocalDate asOf) {
        return jdbc.query(
                "SELECT cohort.user_id, cohort.cohort_date, COALESCE(attribution.channel, 'DIRECT') AS channel, activity.activity_date "
                        + "FROM (SELECT user_id, MIN(activity_date) AS cohort_date "
                        + "      FROM novel_reader_activity_event GROUP BY user_id) cohort "
                        + "JOIN novel_reader_activity_event activity ON activity.user_id = cohort.user_id "
                        + " AND activity.activity_date >= cohort.cohort_date AND activity.activity_date <= ? "
                        + "LEFT JOIN novel_channel_attribution attribution ON attribution.user_id = cohort.user_id "
                        + "WHERE cohort.cohort_date >= ? AND cohort.cohort_date <= ? "
                        + "ORDER BY cohort.cohort_date ASC, channel ASC, cohort.user_id ASC, activity.activity_date ASC",
                (resultSet, rowNumber) -> new CohortActivityRow(
                        resultSet.getLong("user_id"),
                        date(resultSet.getDate("cohort_date")),
                        resultSet.getString("channel"),
                        date(resultSet.getDate("activity_date"))),
                Date.valueOf(asOf),
                Date.valueOf(from),
                Date.valueOf(to));
    }

    public long countActiveReaders(LocalDate from, LocalDate to) {
        Long count = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT user_id) FROM novel_reader_activity_event WHERE activity_date >= ? AND activity_date <= ?",
                Long.class,
                Date.valueOf(from),
                Date.valueOf(to));
        return count == null ? 0 : count;
    }

    public List<ChannelActiveReaderRow> countActiveReadersByChannel(LocalDate from, LocalDate to) {
        return jdbc.query(
                "SELECT COALESCE(attribution.channel, 'DIRECT') AS channel, COUNT(DISTINCT activity.user_id) AS reader_count "
                        + "FROM novel_reader_activity_event activity "
                        + "LEFT JOIN novel_channel_attribution attribution ON attribution.user_id = activity.user_id "
                        + "WHERE activity.activity_date >= ? AND activity.activity_date <= ? "
                        + "GROUP BY COALESCE(attribution.channel, 'DIRECT') ORDER BY channel ASC",
                (resultSet, rowNumber) -> new ChannelActiveReaderRow(
                        resultSet.getString("channel"), resultSet.getLong("reader_count")),
                Date.valueOf(from),
                Date.valueOf(to));
    }

    private static LocalDate date(Date date) {
        return date.toLocalDate();
    }

    public record CohortActivityRow(long userId, LocalDate cohortDate, String channel, LocalDate activityDate) {}
    public record ChannelActiveReaderRow(String channel, long readerCount) {}
}
