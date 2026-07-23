package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus projection for the author-visible, successfully settled reward ledger. */
@Mapper
public interface AuthorRewardPageMapper {
    @Select("""
            <script>
            SELECT r.id,
                   r.book_id AS bookId,
                   b.title AS bookTitle,
                   r.rewarder_user_id AS rewarderUserId,
                   r.amount AS tokenAmount,
                   r.created_at AS rewardedAt
            FROM novel_reward_record r
            JOIN novel_book b ON b.id = r.book_id
            WHERE r.author_id = #{authorId}
              AND EXISTS (
                  SELECT 1
                  FROM novel_token_ledger l
                  WHERE l.user_id = r.rewarder_user_id
                    AND l.transaction_type = 'BOOK_REWARD'
                    AND l.reference_type = 'REWARD'
                    AND l.reference_id = CAST(r.id AS CHAR)
                    AND l.change_amount = -r.amount
              )
            <if test='bookId != null'> AND r.book_id = #{bookId} </if>
            <if test='fromInclusive != null'> AND r.created_at &gt;= #{fromInclusive} </if>
            <if test='toExclusive != null'> AND r.created_at &lt; #{toExclusive} </if>
            ORDER BY r.created_at DESC, r.id DESC
            </script>
            """)
    IPage<AuthorRewardRow> selectSuccessfulRewardPage(
            Page<AuthorRewardRow> page,
            @Param("authorId") long authorId,
            @Param("bookId") Long bookId,
            @Param("fromInclusive") Timestamp fromInclusive,
            @Param("toExclusive") Timestamp toExclusive);

    @Select("""
            <script>
            SELECT COALESCE(SUM(r.amount), 0)
            FROM novel_reward_record r
            WHERE r.author_id = #{authorId}
              AND EXISTS (
                  SELECT 1
                  FROM novel_token_ledger l
                  WHERE l.user_id = r.rewarder_user_id
                    AND l.transaction_type = 'BOOK_REWARD'
                    AND l.reference_type = 'REWARD'
                    AND l.reference_id = CAST(r.id AS CHAR)
                    AND l.change_amount = -r.amount
              )
            <if test='bookId != null'> AND r.book_id = #{bookId} </if>
            <if test='fromInclusive != null'> AND r.created_at &gt;= #{fromInclusive} </if>
            <if test='toExclusive != null'> AND r.created_at &lt; #{toExclusive} </if>
            </script>
            """)
    Long selectSuccessfulRewardTokenTotal(
            @Param("authorId") long authorId,
            @Param("bookId") Long bookId,
            @Param("fromInclusive") Timestamp fromInclusive,
            @Param("toExclusive") Timestamp toExclusive);

    final class AuthorRewardRow {
        private long id;
        private long bookId;
        private String bookTitle;
        private long rewarderUserId;
        private long tokenAmount;
        private Timestamp rewardedAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public String getBookTitle() { return bookTitle; }
        public void setBookTitle(String bookTitle) { this.bookTitle = bookTitle; }
        public long getRewarderUserId() { return rewarderUserId; }
        public void setRewarderUserId(long rewarderUserId) { this.rewarderUserId = rewarderUserId; }
        public long getTokenAmount() { return tokenAmount; }
        public void setTokenAmount(long tokenAmount) { this.tokenAmount = tokenAmount; }
        public Timestamp getRewardedAt() { return rewardedAt; }
        public void setRewardedAt(Timestamp rewardedAt) { this.rewardedAt = rewardedAt; }
    }
}
