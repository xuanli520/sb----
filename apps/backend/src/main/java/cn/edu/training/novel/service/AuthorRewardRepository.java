package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AuthorRewardRecord;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/**
 * Read model for author reward reporting. A reward is reportable only when its immutable record
 * has the matching successful {@code BOOK_REWARD} debit in the token ledger. The write path adds
 * both rows in one transaction, and this additional predicate prevents an incomplete/manual row
 * from being represented as revenue.
 */
@Repository
public class AuthorRewardRepository {
    private static final RowMapper<AuthorRewardRecord> RECORD_MAPPER = (resultSet, rowNumber) -> new AuthorRewardRecord(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getString("book_title"),
            resultSet.getLong("rewarder_user_id"),
            resultSet.getLong("token_amount"),
            resultSet.getTimestamp("rewarded_at").toInstant());

    private final JdbcTemplate jdbc;

    public AuthorRewardRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public QueryResult findSuccessfulRewards(RewardFilter filter) {
        QueryParts filters = filters(filter);
        Aggregate aggregate = aggregate(filters);
        List<Object> pageParameters = new ArrayList<>(filters.parameters());
        pageParameters.add(filter.size());
        pageParameters.add(filter.offset());
        List<AuthorRewardRecord> items = jdbc.query(
                "SELECT r.id, r.book_id, b.title AS book_title, r.rewarder_user_id, r.amount AS token_amount, "
                        + "r.created_at AS rewarded_at FROM novel_reward_record r "
                        + "JOIN novel_book b ON b.id = r.book_id"
                        + filters.where()
                        + " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?",
                RECORD_MAPPER,
                pageParameters.toArray());
        return new QueryResult(items, aggregate.rewardCount(), aggregate.totalTokens());
    }

    private Aggregate aggregate(QueryParts filters) {
        List<Aggregate> aggregates = jdbc.query(
                "SELECT COUNT(*) AS reward_count, COALESCE(SUM(r.amount), 0) AS total_tokens "
                        + "FROM novel_reward_record r"
                        + filters.where(),
                (resultSet, rowNumber) -> new Aggregate(
                        resultSet.getLong("reward_count"),
                        resultSet.getLong("total_tokens")),
                filters.parameters().toArray());
        return aggregates.isEmpty() ? new Aggregate(0, 0) : aggregates.getFirst();
    }

    private static QueryParts filters(RewardFilter filter) {
        StringBuilder where = new StringBuilder(
                " WHERE r.author_id = ?"
                        + " AND EXISTS (SELECT 1 FROM novel_token_ledger l"
                        + " WHERE l.user_id = r.rewarder_user_id"
                        + " AND l.transaction_type = 'BOOK_REWARD'"
                        + " AND l.reference_type = 'REWARD'"
                        + " AND l.reference_id = CAST(r.id AS CHAR)"
                        + " AND l.change_amount = -r.amount)");
        List<Object> parameters = new ArrayList<>();
        parameters.add(filter.authorId());
        if (filter.bookId() != null) {
            where.append(" AND r.book_id = ?");
            parameters.add(filter.bookId());
        }
        if (filter.fromInclusive() != null) {
            where.append(" AND r.created_at >= ?");
            parameters.add(Timestamp.from(filter.fromInclusive()));
        }
        if (filter.toExclusive() != null) {
            where.append(" AND r.created_at < ?");
            parameters.add(Timestamp.from(filter.toExclusive()));
        }
        return new QueryParts(where.toString(), List.copyOf(parameters));
    }

    public record RewardFilter(
            long authorId,
            Long bookId,
            Instant fromInclusive,
            Instant toExclusive,
            int size,
            int offset) {}

    public record QueryResult(List<AuthorRewardRecord> items, long total, long totalTokens) {
        public QueryResult {
            items = List.copyOf(items);
        }
    }

    private record Aggregate(long rewardCount, long totalTokens) {}

    private record QueryParts(String where, List<Object> parameters) {}
}
