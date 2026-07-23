package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AuthorRewardRecord;
import cn.edu.training.novel.mapper.AuthorRewardPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Repository;

/**
 * Read model for author reward reporting. A reward is reportable only when its immutable record
 * has the matching successful {@code BOOK_REWARD} debit in the token ledger. The write path adds
 * both rows in one transaction, and this additional predicate prevents an incomplete/manual row
 * from being represented as revenue.
 */
@Repository
public class AuthorRewardRepository {
    private final AuthorRewardPageMapper pageMapper;

    public AuthorRewardRepository(AuthorRewardPageMapper pageMapper) {
        this.pageMapper = pageMapper;
    }

    public QueryResult findSuccessfulRewards(RewardFilter filter) {
        Timestamp fromInclusive = timestamp(filter.fromInclusive());
        Timestamp toExclusive = timestamp(filter.toExclusive());
        IPage<AuthorRewardPageMapper.AuthorRewardRow> result = pageMapper.selectSuccessfulRewardPage(
                new Page<>(Math.addExact((long) filter.page(), 1L), filter.size(), true),
                filter.authorId(),
                filter.bookId(),
                fromInclusive,
                toExclusive);
        Long totalTokens = pageMapper.selectSuccessfulRewardTokenTotal(
                filter.authorId(), filter.bookId(), fromInclusive, toExclusive);
        return new QueryResult(
                result.getRecords().stream().map(AuthorRewardRepository::toRecord).toList(),
                result.getTotal(),
                totalTokens == null ? 0 : totalTokens);
    }

    public record RewardFilter(
            long authorId,
            Long bookId,
            Instant fromInclusive,
            Instant toExclusive,
            int page,
            int size) {}

    public record QueryResult(List<AuthorRewardRecord> items, long total, long totalTokens) {
        public QueryResult {
            items = List.copyOf(items);
        }
    }

    private static AuthorRewardRecord toRecord(AuthorRewardPageMapper.AuthorRewardRow row) {
        return new AuthorRewardRecord(
                row.getId(),
                row.getBookId(),
                row.getBookTitle(),
                row.getRewarderUserId(),
                row.getTokenAmount(),
                row.getRewardedAt().toInstant());
    }

    private static Timestamp timestamp(Instant value) {
        return value == null ? null : Timestamp.from(value);
    }
}
