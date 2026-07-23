package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus page queries for managed editorial placement and hot-search operations. */
@Mapper
public interface EditorialOperationsPageMapper {
    @Select("""
            SELECT id AS bookId,
                   title AS bookTitle,
                   author_name AS bookAuthor,
                   category AS bookCategory,
                   word_count AS bookWords,
                   serial_status AS bookSerialStatus,
                   synopsis AS bookSynopsis,
                   status AS bookStatus,
                   author_id AS bookAuthorId,
                   heat AS bookHeat,
                   purchase_price AS bookPurchasePrice,
                   editorial_rank AS `rank`
            FROM novel_book
            WHERE editorial_rank IS NOT NULL
            ORDER BY editorial_rank ASC, id ASC
            """)
    IPage<EditorialRecommendationRow> selectRecommendationPage(Page<EditorialRecommendationRow> page);

    @Select("""
            SELECT id,
                   book_id AS bookId,
                   action,
                   previous_rank AS previousRank,
                   new_rank AS `rank`,
                   details,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_editorial_recommendation_audit
            ORDER BY created_at DESC, id DESC
            """)
    IPage<EditorialRecommendationAuditRow> selectRecommendationAuditPage(
            Page<EditorialRecommendationAuditRow> page);

    @Select("""
            SELECT id,
                   term,
                   enabled,
                   display_rank AS `rank`,
                   created_by_user_id AS createdByUserId,
                   updated_by_user_id AS updatedByUserId,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM novel_hot_search_term
            ORDER BY display_rank ASC, id ASC
            """)
    IPage<HotSearchTermRow> selectHotSearchTermPage(Page<HotSearchTermRow> page);

    @Select("""
            SELECT id,
                   term,
                   enabled,
                   display_rank AS `rank`,
                   created_by_user_id AS createdByUserId,
                   updated_by_user_id AS updatedByUserId,
                   created_at AS createdAt,
                   updated_at AS updatedAt
            FROM novel_hot_search_term
            WHERE enabled = TRUE
            ORDER BY display_rank ASC, id ASC
            """)
    IPage<HotSearchTermRow> selectEnabledHotSearchTermPage(Page<HotSearchTermRow> page);

    @Select("""
            SELECT id,
                   term_id AS termId,
                   term,
                   action,
                   previous_rank AS previousRank,
                   new_rank AS `rank`,
                   details,
                   operator_user_id AS operatorUserId,
                   created_at AS createdAt
            FROM novel_hot_search_term_audit
            ORDER BY created_at DESC, id DESC
            """)
    IPage<HotSearchTermAuditRow> selectHotSearchTermAuditPage(Page<HotSearchTermAuditRow> page);

    /** Flattened book columns keep the page query independent from constructor mapping rules. */
    final class EditorialRecommendationRow {
        private long bookId;
        private String bookTitle;
        private String bookAuthor;
        private String bookCategory;
        private int bookWords;
        private String bookSerialStatus;
        private String bookSynopsis;
        private String bookStatus;
        private long bookAuthorId;
        private long bookHeat;
        private long bookPurchasePrice;
        private int rank;

        public long getBookId() { return bookId; }
        public void setBookId(long value) { this.bookId = value; }
        public String getBookTitle() { return bookTitle; }
        public void setBookTitle(String value) { this.bookTitle = value; }
        public String getBookAuthor() { return bookAuthor; }
        public void setBookAuthor(String value) { this.bookAuthor = value; }
        public String getBookCategory() { return bookCategory; }
        public void setBookCategory(String value) { this.bookCategory = value; }
        public int getBookWords() { return bookWords; }
        public void setBookWords(int value) { this.bookWords = value; }
        public String getBookSerialStatus() { return bookSerialStatus; }
        public void setBookSerialStatus(String value) { this.bookSerialStatus = value; }
        public String getBookSynopsis() { return bookSynopsis; }
        public void setBookSynopsis(String value) { this.bookSynopsis = value; }
        public String getBookStatus() { return bookStatus; }
        public void setBookStatus(String value) { this.bookStatus = value; }
        public long getBookAuthorId() { return bookAuthorId; }
        public void setBookAuthorId(long value) { this.bookAuthorId = value; }
        public long getBookHeat() { return bookHeat; }
        public void setBookHeat(long value) { this.bookHeat = value; }
        public long getBookPurchasePrice() { return bookPurchasePrice; }
        public void setBookPurchasePrice(long value) { this.bookPurchasePrice = value; }
        public int getRank() { return rank; }
        public void setRank(int value) { this.rank = value; }
    }

    final class EditorialRecommendationAuditRow {
        private long id;
        private long bookId;
        private String action;
        private Integer previousRank;
        private Integer rank;
        private String details;
        private long operatorUserId;
        private Timestamp createdAt;

        public long getId() { return id; }
        public void setId(long value) { this.id = value; }
        public long getBookId() { return bookId; }
        public void setBookId(long value) { this.bookId = value; }
        public String getAction() { return action; }
        public void setAction(String value) { this.action = value; }
        public Integer getPreviousRank() { return previousRank; }
        public void setPreviousRank(Integer value) { this.previousRank = value; }
        public Integer getRank() { return rank; }
        public void setRank(Integer value) { this.rank = value; }
        public String getDetails() { return details; }
        public void setDetails(String value) { this.details = value; }
        public long getOperatorUserId() { return operatorUserId; }
        public void setOperatorUserId(long value) { this.operatorUserId = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { this.createdAt = value; }
    }

    final class HotSearchTermRow {
        private long id;
        private String term;
        private boolean enabled;
        private int rank;
        private Long createdByUserId;
        private Long updatedByUserId;
        private Timestamp createdAt;
        private Timestamp updatedAt;

        public long getId() { return id; }
        public void setId(long value) { this.id = value; }
        public String getTerm() { return term; }
        public void setTerm(String value) { this.term = value; }
        public boolean isEnabled() { return enabled; }
        public void setEnabled(boolean value) { this.enabled = value; }
        public int getRank() { return rank; }
        public void setRank(int value) { this.rank = value; }
        public Long getCreatedByUserId() { return createdByUserId; }
        public void setCreatedByUserId(Long value) { this.createdByUserId = value; }
        public Long getUpdatedByUserId() { return updatedByUserId; }
        public void setUpdatedByUserId(Long value) { this.updatedByUserId = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { this.createdAt = value; }
        public Timestamp getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(Timestamp value) { this.updatedAt = value; }
    }

    final class HotSearchTermAuditRow {
        private long id;
        private long termId;
        private String term;
        private String action;
        private Integer previousRank;
        private Integer rank;
        private String details;
        private long operatorUserId;
        private Timestamp createdAt;

        public long getId() { return id; }
        public void setId(long value) { this.id = value; }
        public long getTermId() { return termId; }
        public void setTermId(long value) { this.termId = value; }
        public String getTerm() { return term; }
        public void setTerm(String value) { this.term = value; }
        public String getAction() { return action; }
        public void setAction(String value) { this.action = value; }
        public Integer getPreviousRank() { return previousRank; }
        public void setPreviousRank(Integer value) { this.previousRank = value; }
        public Integer getRank() { return rank; }
        public void setRank(Integer value) { this.rank = value; }
        public String getDetails() { return details; }
        public void setDetails(String value) { this.details = value; }
        public long getOperatorUserId() { return operatorUserId; }
        public void setOperatorUserId(long value) { this.operatorUserId = value; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp value) { this.createdAt = value; }
    }
}
