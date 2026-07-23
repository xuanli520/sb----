package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.edu.training.novel.domain.Book;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus page query for public discovery; its interceptor owns LIMIT/OFFSET and totals. */
@Mapper
public interface CatalogPageMapper {
    @Select("""
            <script>
            SELECT id, title, author_name AS author, category, word_count AS words,
                   serial_status AS serialStatus, synopsis, cover, status,
                   author_id AS authorId, heat, purchase_price AS purchasePrice
            FROM novel_book
            WHERE status = 'PUBLISHED'
            <if test='pattern != null'>
              AND (LOWER(title) LIKE #{pattern} ESCAPE '!' OR LOWER(author_name) LIKE #{pattern} ESCAPE '!'
                   OR LOWER(synopsis) LIKE #{pattern} ESCAPE '!')
            </if>
            <if test='category != null'> AND category = #{category} </if>
            <if test='serialStatus != null'> AND serial_status = #{serialStatus} </if>
            <if test='minWords != null'> AND word_count &gt;= #{minWords} </if>
            <if test='maxWords != null'> AND word_count &lt;= #{maxWords} </if>
            ORDER BY heat DESC, id ASC
            </script>
            """)
    IPage<Book> selectPublishedPage(
            Page<Book> page,
            @Param("pattern") String pattern,
            @Param("category") String category,
            @Param("serialStatus") String serialStatus,
            @Param("minWords") Integer minWords,
            @Param("maxWords") Integer maxWords);
}
