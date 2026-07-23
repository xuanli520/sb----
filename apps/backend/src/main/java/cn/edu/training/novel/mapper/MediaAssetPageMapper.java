package cn.edu.training.novel.mapper;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** MyBatis-Plus-backed, database-filtered platform banner inventory page. */
@Mapper
public interface MediaAssetPageMapper {
    @Select("""
            <script>
            SELECT id,
                   owner_scope AS ownerScope,
                   owner_user_id AS ownerUserId,
                   purpose,
                   object_key AS objectKey,
                   public_url AS publicUrl,
                   sha256,
                   content_type AS contentType,
                   width,
                   height,
                   byte_size AS byteSize,
                   label,
                   state,
                   created_at AS createdAt,
                   updated_at AS updatedAt,
                   archived_at AS archivedAt,
                   deleted_at AS deletedAt
            FROM novel_media_asset
            WHERE owner_scope = 'PLATFORM' AND purpose = 'HOME_CAROUSEL_BANNER'
            <if test='state != null'> AND state = #{state} </if>
            <if test='labelPattern != null'>
              AND (LOWER(COALESCE(label, '')) LIKE #{labelPattern} ESCAPE '!'
                   OR LOWER(id) LIKE #{idPrefix} ESCAPE '!')
            </if>
            ORDER BY created_at DESC, id DESC
            </script>
            """)
    IPage<MediaAssetRow> selectPlatformBannerPage(
            Page<MediaAssetRow> page,
            @Param("state") String state,
            @Param("labelPattern") String labelPattern,
            @Param("idPrefix") String idPrefix);

    /** The stationmaster's cover-candidate queue is also a growth surface, so pagination stays database-owned. */
    @Select("""
            <script>
            SELECT id,
                   book_id AS bookId,
                   asset_id AS assetId,
                   approved_asset_id AS approvedAssetId,
                   status,
                   review_reason AS reviewReason,
                   created_by_user_id AS createdByUserId,
                   created_at AS createdAt,
                   reviewed_by_user_id AS reviewedByUserId,
                   reviewed_at AS reviewedAt
            FROM novel_book_cover_candidate
            <if test='status != null'> WHERE status = #{status} </if>
            ORDER BY created_at DESC, id DESC
            </script>
            """)
    IPage<CoverCandidateRow> selectCoverCandidatePage(
            Page<CoverCandidateRow> page,
            @Param("status") String status);

    /** JDBC-shaped mapper row keeps enum/UUID conversion at the media repository boundary. */
    final class MediaAssetRow {
        private String id;
        private String ownerScope;
        private Long ownerUserId;
        private String purpose;
        private String objectKey;
        private String publicUrl;
        private String sha256;
        private String contentType;
        private int width;
        private int height;
        private long byteSize;
        private String label;
        private String state;
        private Timestamp createdAt;
        private Timestamp updatedAt;
        private Timestamp archivedAt;
        private Timestamp deletedAt;

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getOwnerScope() { return ownerScope; }
        public void setOwnerScope(String ownerScope) { this.ownerScope = ownerScope; }
        public Long getOwnerUserId() { return ownerUserId; }
        public void setOwnerUserId(Long ownerUserId) { this.ownerUserId = ownerUserId; }
        public String getPurpose() { return purpose; }
        public void setPurpose(String purpose) { this.purpose = purpose; }
        public String getObjectKey() { return objectKey; }
        public void setObjectKey(String objectKey) { this.objectKey = objectKey; }
        public String getPublicUrl() { return publicUrl; }
        public void setPublicUrl(String publicUrl) { this.publicUrl = publicUrl; }
        public String getSha256() { return sha256; }
        public void setSha256(String sha256) { this.sha256 = sha256; }
        public String getContentType() { return contentType; }
        public void setContentType(String contentType) { this.contentType = contentType; }
        public int getWidth() { return width; }
        public void setWidth(int width) { this.width = width; }
        public int getHeight() { return height; }
        public void setHeight(int height) { this.height = height; }
        public long getByteSize() { return byteSize; }
        public void setByteSize(long byteSize) { this.byteSize = byteSize; }
        public String getLabel() { return label; }
        public void setLabel(String label) { this.label = label; }
        public String getState() { return state; }
        public void setState(String state) { this.state = state; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
        public Timestamp getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(Timestamp updatedAt) { this.updatedAt = updatedAt; }
        public Timestamp getArchivedAt() { return archivedAt; }
        public void setArchivedAt(Timestamp archivedAt) { this.archivedAt = archivedAt; }
        public Timestamp getDeletedAt() { return deletedAt; }
        public void setDeletedAt(Timestamp deletedAt) { this.deletedAt = deletedAt; }
    }

    final class CoverCandidateRow {
        private long id;
        private long bookId;
        private String assetId;
        private String approvedAssetId;
        private String status;
        private String reviewReason;
        private long createdByUserId;
        private Timestamp createdAt;
        private Long reviewedByUserId;
        private Timestamp reviewedAt;

        public long getId() { return id; }
        public void setId(long id) { this.id = id; }
        public long getBookId() { return bookId; }
        public void setBookId(long bookId) { this.bookId = bookId; }
        public String getAssetId() { return assetId; }
        public void setAssetId(String assetId) { this.assetId = assetId; }
        public String getApprovedAssetId() { return approvedAssetId; }
        public void setApprovedAssetId(String approvedAssetId) { this.approvedAssetId = approvedAssetId; }
        public String getStatus() { return status; }
        public void setStatus(String status) { this.status = status; }
        public String getReviewReason() { return reviewReason; }
        public void setReviewReason(String reviewReason) { this.reviewReason = reviewReason; }
        public long getCreatedByUserId() { return createdByUserId; }
        public void setCreatedByUserId(long createdByUserId) { this.createdByUserId = createdByUserId; }
        public Timestamp getCreatedAt() { return createdAt; }
        public void setCreatedAt(Timestamp createdAt) { this.createdAt = createdAt; }
        public Long getReviewedByUserId() { return reviewedByUserId; }
        public void setReviewedByUserId(Long reviewedByUserId) { this.reviewedByUserId = reviewedByUserId; }
        public Timestamp getReviewedAt() { return reviewedAt; }
        public void setReviewedAt(Timestamp reviewedAt) { this.reviewedAt = reviewedAt; }
    }
}
