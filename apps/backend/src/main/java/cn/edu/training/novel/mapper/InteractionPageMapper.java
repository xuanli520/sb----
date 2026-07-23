package cn.edu.training.novel.mapper;

import cn.edu.training.novel.domain.AuthorModerationAdvice;
import cn.edu.training.novel.domain.Comment;
import cn.edu.training.novel.domain.ParagraphAnnotation;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * MyBatis-Plus page queries for reader interactions. The caller supplies only already-authorized
 * scopes; the dynamic predicates remain parameterized and the pagination interceptor owns both
 * the count and dialect-specific limit/offset clauses.
 */
@Mapper
public interface InteractionPageMapper {
    @Select("""
            <script>
            SELECT c.id AS id,
                   c.book_id AS bookId,
                   c.chapter_id AS chapterId,
                   c.user_id AS userId,
                   c.author_name AS authorName,
                   c.content AS content,
                   c.status AS status,
                   c.created_at AS createdAt
            <choose>
              <when test='includeAuthorAdvice'>
                   , aa.recommendation AS authorAdviceRecommendation,
                     aa.reason AS authorAdviceReason,
                     aa.updated_at AS authorAdviceUpdatedAt
              </when>
              <otherwise>
                   , NULL AS authorAdviceRecommendation,
                     NULL AS authorAdviceReason,
                     NULL AS authorAdviceUpdatedAt
              </otherwise>
            </choose>
            FROM novel_comment c
            <if test='includeAuthorAdvice'>
              LEFT JOIN novel_author_comment_moderation_advice aa ON aa.comment_id = c.id
            </if>
            WHERE 1 = 1
            <if test='bookId != null'> AND c.book_id = #{bookId} </if>
            <if test='chapterId != null'> AND c.chapter_id = #{chapterId} </if>
            <if test='bookLevelOnly'> AND c.chapter_id IS NULL </if>
            <if test='status != null'> AND c.status = #{status} </if>
            <if test='userId != null'> AND c.user_id = #{userId} </if>
            ORDER BY c.created_at DESC, c.id DESC
            </script>
            """)
    IPage<CommentRow> selectCommentPage(
            Page<CommentRow> page,
            @Param("bookId") Long bookId,
            @Param("chapterId") Long chapterId,
            @Param("status") String status,
            @Param("userId") Long userId,
            @Param("bookLevelOnly") boolean bookLevelOnly,
            @Param("includeAuthorAdvice") boolean includeAuthorAdvice);

    @Select("""
            <script>
            SELECT a.id AS id,
                   a.book_id AS bookId,
                   a.chapter_id AS chapterId,
                   a.user_id AS userId,
                   a.author_name AS authorName,
                   a.paragraph_index AS paragraphIndex,
                   a.selection_start AS selectionStart,
                   a.selection_end AS selectionEnd,
                   a.selected_text AS selectedText,
                   a.note AS note,
                   a.share_intent AS shareIntent,
                   a.status AS status,
                   a.created_at AS createdAt
            <choose>
              <when test='includeAuthorAdvice'>
                   , aa.recommendation AS authorAdviceRecommendation,
                     aa.reason AS authorAdviceReason,
                     aa.updated_at AS authorAdviceUpdatedAt
              </when>
              <otherwise>
                   , NULL AS authorAdviceRecommendation,
                     NULL AS authorAdviceReason,
                     NULL AS authorAdviceUpdatedAt
              </otherwise>
            </choose>
            FROM novel_paragraph_annotation a
            <if test='includeAuthorAdvice'>
              LEFT JOIN novel_author_annotation_moderation_advice aa ON aa.annotation_id = a.id
            </if>
            <if test='requirePublishedTarget'>
              JOIN novel_book b ON b.id = a.book_id
              JOIN novel_chapter c ON c.id = a.chapter_id AND c.book_id = a.book_id
            </if>
            WHERE 1 = 1
            <if test='requirePublishedTarget'>
              AND b.status = 'PUBLISHED' AND c.published = TRUE AND c.status = 'PUBLISHED'
            </if>
            <if test='bookId != null'> AND a.book_id = #{bookId} </if>
            <if test='chapterId != null'> AND a.chapter_id = #{chapterId} </if>
            <if test='status != null'> AND a.status = #{status} </if>
            <if test='userId != null'> AND a.user_id = #{userId} </if>
            <if test='shareIntent != null'> AND a.share_intent = #{shareIntent} </if>
            ORDER BY a.created_at DESC, a.id DESC
            </script>
            """)
    IPage<ParagraphAnnotationRow> selectParagraphAnnotationPage(
            Page<ParagraphAnnotationRow> page,
            @Param("bookId") Long bookId,
            @Param("chapterId") Long chapterId,
            @Param("status") String status,
            @Param("userId") Long userId,
            @Param("shareIntent") Boolean shareIntent,
            @Param("requirePublishedTarget") boolean requirePublishedTarget,
            @Param("includeAuthorAdvice") boolean includeAuthorAdvice);

    /** Bean projections keep the mapper independent from JDBC and convert to immutable API rows. */
    final class CommentRow {
        private long id;
        private long bookId;
        private Long chapterId;
        private long userId;
        private String authorName;
        private String content;
        private String status;
        private Timestamp createdAt;
        private String authorAdviceRecommendation;
        private String authorAdviceReason;
        private Timestamp authorAdviceUpdatedAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public Long getChapterId() { return chapterId; }
        public void setChapterId(Long chapterId) { this.chapterId = chapterId; }
        public long getUserId() { return userId; }
        public void setUserId(long userId) { this.userId = userId; }
        public String getAuthorName() { return authorName; }
        public void setAuthorName(String authorName) { this.authorName = authorName; }
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
        public String getAuthorAdviceRecommendation() { return authorAdviceRecommendation; }
        public void setAuthorAdviceRecommendation(String value) { this.authorAdviceRecommendation = value; }
        public String getAuthorAdviceReason() { return authorAdviceReason; }
        public void setAuthorAdviceReason(String value) { this.authorAdviceReason = value; }
        public Timestamp getAuthorAdviceUpdatedAt() { return authorAdviceUpdatedAt; }
        public void setAuthorAdviceUpdatedAt(Timestamp value) { this.authorAdviceUpdatedAt = value; }

        public Comment toDomain() {
            return new Comment(
                    id,
                    bookId,
                    chapterId,
                    userId,
                    authorName,
                    content,
                    status,
                    createdAt.toInstant(),
                    authorAdviceRecommendation == null
                            ? null
                            : new AuthorModerationAdvice(
                                    authorAdviceRecommendation,
                                    authorAdviceReason,
                                    authorAdviceUpdatedAt.toInstant()));
        }
    }

    /** See {@link CommentRow}; author advice is populated only for author/admin scoped queries. */
    final class ParagraphAnnotationRow {
        private long id;
        private long bookId;
        private long chapterId;
        private long userId;
        private String authorName;
        private int paragraphIndex;
        private int selectionStart;
        private int selectionEnd;
        private String selectedText;
        private String note;
        private boolean shareIntent;
        private String status;
        private Timestamp createdAt;
        private String authorAdviceRecommendation;
        private String authorAdviceReason;
        private Timestamp authorAdviceUpdatedAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public long getChapterId() { return chapterId; }
        public void setChapterId(long chapterId) { this.chapterId = chapterId; }
        public long getUserId() { return userId; }
        public void setUserId(long userId) { this.userId = userId; }
        public String getAuthorName() { return authorName; }
        public void setAuthorName(String authorName) { this.authorName = authorName; }
        public int getParagraphIndex() { return paragraphIndex; }
        public void setParagraphIndex(int paragraphIndex) { this.paragraphIndex = paragraphIndex; }
        public int getSelectionStart() { return selectionStart; }
        public void setSelectionStart(int selectionStart) { this.selectionStart = selectionStart; }
        public int getSelectionEnd() { return selectionEnd; }
        public void setSelectionEnd(int selectionEnd) { this.selectionEnd = selectionEnd; }
        public String getSelectedText() { return selectedText; }
        public void setSelectedText(String selectedText) { this.selectedText = selectedText; }
        public String getNote() { return note; }
        public void setNote(String note) { this.note = note; }
        public boolean isShareIntent() { return shareIntent; }
        public void setShareIntent(boolean shareIntent) { this.shareIntent = shareIntent; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
        public String getAuthorAdviceRecommendation() { return authorAdviceRecommendation; }
        public void setAuthorAdviceRecommendation(String value) { this.authorAdviceRecommendation = value; }
        public String getAuthorAdviceReason() { return authorAdviceReason; }
        public void setAuthorAdviceReason(String value) { this.authorAdviceReason = value; }
        public Timestamp getAuthorAdviceUpdatedAt() { return authorAdviceUpdatedAt; }
        public void setAuthorAdviceUpdatedAt(Timestamp value) { this.authorAdviceUpdatedAt = value; }

        public ParagraphAnnotation toDomain() {
            return new ParagraphAnnotation(
                    id,
                    bookId,
                    chapterId,
                    userId,
                    authorName,
                    paragraphIndex,
                    selectionStart,
                    selectionEnd,
                    selectedText,
                    note,
                    shareIntent,
                    status,
                    createdAt.toInstant(),
                    authorAdviceRecommendation == null
                            ? null
                            : new AuthorModerationAdvice(
                                    authorAdviceRecommendation,
                                    authorAdviceReason,
                                    authorAdviceUpdatedAt.toInstant()));
        }
    }
}
