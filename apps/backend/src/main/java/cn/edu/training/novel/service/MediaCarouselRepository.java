package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookCoverCandidate;
import cn.edu.training.novel.domain.BookCoverCandidateStatus;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.HomeCarouselSlide;
import cn.edu.training.novel.domain.HomeCarouselSlideAudit;
import cn.edu.training.novel.domain.MediaAsset;
import cn.edu.training.novel.domain.MediaAssetAudit;
import cn.edu.training.novel.domain.MediaAssetBinding;
import cn.edu.training.novel.domain.MediaAssetOwnerScope;
import cn.edu.training.novel.domain.MediaAssetPurpose;
import cn.edu.training.novel.domain.MediaAssetState;
import cn.edu.training.novel.domain.MediaAssetPage;
import cn.edu.training.novel.mapper.MediaAssetPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/** JDBC boundary for immutable media assets and independently ordered home-carousel slides. */
@Repository
public class MediaCarouselRepository {
    static final int MAX_RANK = 100_000;
    private static final int TEMPORARY_RANK_BASE = 1_000_000;
    private static final String BOOK_COLUMNS = "b.id, b.title, b.author_name, b.category, b.word_count, b.serial_status, "
            + "b.synopsis, NULL AS cover, b.status, b.author_id, b.heat, b.purchase_price";
    private static final RowMapper<Book> BOOK_MAPPER = (resultSet, rowNumber) -> new Book(
            resultSet.getLong("id"),
            resultSet.getString("title"),
            resultSet.getString("author_name"),
            resultSet.getString("category"),
            resultSet.getInt("word_count"),
            resultSet.getString("serial_status"),
            resultSet.getString("synopsis"),
            null,
            BookStatus.valueOf(resultSet.getString("status")),
            resultSet.getLong("author_id"),
            resultSet.getLong("heat"),
            resultSet.getLong("purchase_price"));
    private static final RowMapper<MediaAsset> ASSET_MAPPER = (resultSet, rowNumber) -> new MediaAsset(
            UUID.fromString(resultSet.getString("id")),
            MediaAssetOwnerScope.valueOf(resultSet.getString("owner_scope")),
            resultSet.getObject("owner_user_id", Long.class),
            MediaAssetPurpose.valueOf(resultSet.getString("purpose")),
            resultSet.getString("object_key"),
            resultSet.getString("public_url"),
            resultSet.getString("sha256"),
            resultSet.getString("content_type"),
            resultSet.getInt("width"),
            resultSet.getInt("height"),
            resultSet.getLong("byte_size"),
            resultSet.getString("label"),
            MediaAssetState.valueOf(resultSet.getString("state")),
            instant(resultSet.getTimestamp("created_at")),
            instant(resultSet.getTimestamp("updated_at")),
            instant(resultSet.getTimestamp("archived_at")),
            instant(resultSet.getTimestamp("deleted_at")));
    private static final RowMapper<MediaAssetBinding> BINDING_MAPPER = (resultSet, rowNumber) -> new MediaAssetBinding(
            resultSet.getLong("id"),
            UUID.fromString(resultSet.getString("asset_id")),
            MediaAssetPurpose.valueOf(resultSet.getString("binding_type")),
            resultSet.getLong("target_id"),
            resultSet.getObject("created_by_user_id", Long.class),
            instant(resultSet.getTimestamp("created_at")));
    private static final RowMapper<MediaAssetAudit> ASSET_AUDIT_MAPPER = (resultSet, rowNumber) -> new MediaAssetAudit(
            resultSet.getLong("id"),
            UUID.fromString(resultSet.getString("asset_id")),
            resultSet.getString("action"),
            resultSet.getString("details"),
            resultSet.getObject("operator_user_id", Long.class),
            instant(resultSet.getTimestamp("created_at")));
    private static final RowMapper<BookCoverCandidate> COVER_CANDIDATE_MAPPER = (resultSet, rowNumber) -> new BookCoverCandidate(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            UUID.fromString(resultSet.getString("asset_id")),
            uuid(resultSet.getString("approved_asset_id")),
            BookCoverCandidateStatus.valueOf(resultSet.getString("status")),
            resultSet.getString("review_reason"),
            resultSet.getLong("created_by_user_id"),
            instant(resultSet.getTimestamp("created_at")),
            resultSet.getObject("reviewed_by_user_id", Long.class),
            instant(resultSet.getTimestamp("reviewed_at")));
    private static final RowMapper<HomeCarouselSlideAudit> CAROUSEL_AUDIT_MAPPER = (resultSet, rowNumber) -> new HomeCarouselSlideAudit(
            resultSet.getLong("id"),
            resultSet.getLong("slide_id"),
            resultSet.getLong("book_id"),
            resultSet.getString("action"),
            resultSet.getString("details"),
            resultSet.getObject("operator_user_id", Long.class),
            instant(resultSet.getTimestamp("created_at")));
    private static final RowMapper<CarouselSlideData> SLIDE_MAPPER = (resultSet, rowNumber) -> new CarouselSlideData(
            resultSet.getLong("slide_id"),
            BOOK_MAPPER.mapRow(resultSet, rowNumber),
            uuid(resultSet.getString("banner_asset_id")),
            resultSet.getString("banner_url"),
            resultSet.getString("headline"),
            resultSet.getString("copy_text"),
            resultSet.getBoolean("enabled"),
            resultSet.getInt("display_rank"),
            resultSet.getLong("version"),
            instant(resultSet.getTimestamp("created_at")),
            instant(resultSet.getTimestamp("updated_at")));
    private static final RowMapper<CarouselRow> CAROUSEL_ROW_MAPPER = (resultSet, rowNumber) -> new CarouselRow(
            resultSet.getLong("id"),
            resultSet.getLong("book_id"),
            resultSet.getString("headline"),
            resultSet.getString("copy_text"),
            resultSet.getBoolean("enabled"),
            resultSet.getInt("display_rank"),
            resultSet.getLong("version"));

    private final JdbcTemplate jdbc;
    private final MediaAssetPageMapper mediaAssetPageMapper;

    public MediaCarouselRepository(JdbcTemplate jdbc, MediaAssetPageMapper mediaAssetPageMapper) {
        this.jdbc = jdbc;
        this.mediaAssetPageMapper = mediaAssetPageMapper;
    }

    public MediaAsset createAsset(MediaAsset asset) {
        int changed = jdbc.update(
                "INSERT INTO novel_media_asset(id, owner_scope, owner_user_id, purpose, object_key, public_url, sha256, "
                        + "content_type, width, height, byte_size, label, state, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                asset.id().toString(),
                asset.ownerScope().name(),
                asset.ownerUserId(),
                asset.purpose().name(),
                asset.objectKey(),
                asset.publicUrl(),
                asset.sha256(),
                asset.contentType(),
                asset.width(),
                asset.height(),
                asset.byteSize(),
                asset.label(),
                asset.state().name());
        if (changed != 1) throw new IllegalStateException("media asset was not saved");
        return findAsset(asset.id()).orElseThrow(() -> new IllegalStateException("media asset was not saved"));
    }

    public Optional<MediaAsset> findAsset(UUID assetId) {
        return queryOne("SELECT " + assetColumns() + " FROM novel_media_asset WHERE id = ?", ASSET_MAPPER, assetId.toString());
    }

    public Optional<MediaAsset> findAssetForUpdate(UUID assetId) {
        return queryOne("SELECT " + assetColumns() + " FROM novel_media_asset WHERE id = ? FOR UPDATE", ASSET_MAPPER, assetId.toString());
    }

    public MediaAssetPage findPlatformBannerAssets(
            MediaAssetState requestedState,
            String query,
            int page,
            int size) {
        String normalizedQuery = query == null || query.isBlank()
                ? null
                : escapeLike(query.trim().toLowerCase(java.util.Locale.ROOT));
        Page<MediaAssetPageMapper.MediaAssetRow> request = new Page<>(Math.addExact(page, 1L), size, true);
        IPage<MediaAssetPageMapper.MediaAssetRow> result = mediaAssetPageMapper.selectPlatformBannerPage(
                request,
                requestedState == null ? null : requestedState.name(),
                normalizedQuery == null ? null : "%" + normalizedQuery + "%",
                normalizedQuery == null ? null : normalizedQuery + "%");
        List<MediaAsset> items = result.getRecords().stream().map(MediaCarouselRepository::mediaAsset).toList();
        return new MediaAssetPage(items, new MediaAssetPage.Meta(result.getTotal(), page, size));
    }

    public BookCoverCandidate createCoverCandidate(BookCoverCandidate candidate) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_book_cover_candidate(book_id, asset_id, status, created_by_user_id, created_at) "
                            + "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, candidate.bookId());
            statement.setString(2, candidate.assetId().toString());
            statement.setString(3, candidate.status().name());
            statement.setLong(4, candidate.createdByUserId());
            return statement;
        }, keyHolder);
        return findCoverCandidateByIdForUpdate(generatedId(keyHolder, "book cover candidate"))
                .orElseThrow(() -> new IllegalStateException("book cover candidate was not saved"));
    }

    public Optional<BookCoverCandidate> findCoverCandidateById(long candidateId) {
        return queryOne(
                "SELECT " + coverCandidateColumns() + " FROM novel_book_cover_candidate WHERE id = ?",
                COVER_CANDIDATE_MAPPER,
                candidateId);
    }

    public Optional<BookCoverCandidate> findCoverCandidateByIdForUpdate(long candidateId) {
        return queryOne(
                "SELECT " + coverCandidateColumns() + " FROM novel_book_cover_candidate WHERE id = ? FOR UPDATE",
                COVER_CANDIDATE_MAPPER,
                candidateId);
    }

    public List<BookCoverCandidate> findCoverCandidatesByBookId(long bookId) {
        return jdbc.query(
                "SELECT " + coverCandidateColumns() + " FROM novel_book_cover_candidate WHERE book_id = ? "
                        + "ORDER BY created_at DESC, id DESC",
                COVER_CANDIDATE_MAPPER,
                bookId);
    }

    public List<BookCoverCandidate> findPendingCoverCandidatesByBookIdForUpdate(long bookId) {
        return jdbc.query(
                "SELECT " + coverCandidateColumns() + " FROM novel_book_cover_candidate WHERE book_id = ? AND status = ? "
                        + "ORDER BY id ASC FOR UPDATE",
                COVER_CANDIDATE_MAPPER,
                bookId,
                BookCoverCandidateStatus.PENDING_REVIEW.name());
    }

    public CandidatePage findCoverCandidatePage(BookCoverCandidateStatus requestedStatus, int page, int size) {
        Page<MediaAssetPageMapper.CoverCandidateRow> request = new Page<>(Math.addExact((long) page, 1L), size, true);
        IPage<MediaAssetPageMapper.CoverCandidateRow> result = mediaAssetPageMapper.selectCoverCandidatePage(
                request,
                requestedStatus == null ? null : requestedStatus.name());
        return new CandidatePage(
                result.getRecords().stream().map(MediaCarouselRepository::coverCandidate).toList(),
                result.getTotal(),
                page,
                size);
    }

    /** Resolves candidate-page books in one query; the caller adds cover bindings in its own batch. */
    public Map<Long, Book> findBooksByIds(List<Long> bookIds) {
        if (bookIds == null || bookIds.isEmpty()) return Map.of();
        List<Long> ids = bookIds.stream().distinct().toList();
        String placeholders = String.join(",", java.util.Collections.nCopies(ids.size(), "?"));
        return jdbc.query(
                        "SELECT " + rawBookColumns() + " FROM novel_book WHERE id IN (" + placeholders + ")",
                        rawBookMapper(),
                        ids.toArray())
                .stream()
                .collect(java.util.stream.Collectors.toUnmodifiableMap(Book::id, book -> book));
    }

    public void resolveCoverCandidate(
            long candidateId,
            BookCoverCandidateStatus status,
            String reason,
            long reviewerUserId,
            Instant reviewedAt,
            UUID approvedAssetId) {
        int changed = jdbc.update(
                "UPDATE novel_book_cover_candidate SET status = ?, review_reason = ?, reviewed_by_user_id = ?, reviewed_at = ?, "
                        + "approved_asset_id = ? WHERE id = ? AND status = ?",
                status.name(),
                reason,
                reviewerUserId,
                Timestamp.from(reviewedAt),
                approvedAssetId == null ? null : approvedAssetId.toString(),
                candidateId,
                BookCoverCandidateStatus.PENDING_REVIEW.name());
        if (changed == 0) throw new IllegalStateException("book cover candidate changed by another operator");
    }

    public List<MediaAssetBinding> findBindings(UUID assetId) {
        return jdbc.query(
                "SELECT id, asset_id, binding_type, target_id, created_by_user_id, created_at "
                        + "FROM novel_media_asset_binding WHERE asset_id = ? ORDER BY created_at DESC, id DESC",
                BINDING_MAPPER,
                assetId.toString());
    }

    /** Public/read-model cover resolution comes only from the current asset binding. */
    public Map<Long, String> findActiveBookCoverUrls(List<Long> bookIds) {
        if (bookIds == null || bookIds.isEmpty()) return Map.of();
        String placeholders = String.join(",", java.util.Collections.nCopies(bookIds.size(), "?"));
        List<Object> arguments = new ArrayList<>();
        arguments.add(MediaAssetPurpose.BOOK_COVER.name());
        arguments.add(MediaAssetState.ACTIVE.name());
        arguments.addAll(bookIds);
        return jdbc.query(
                        "SELECT binding.target_id, asset.public_url FROM novel_media_asset_binding binding "
                                + "JOIN novel_media_asset asset ON asset.id = binding.asset_id "
                                + "WHERE binding.binding_type = ? AND asset.state = ? AND binding.target_id IN (" + placeholders + ")",
                        (resultSet, rowNumber) -> Map.entry(
                                resultSet.getLong("target_id"), resultSet.getString("public_url")),
                        arguments.toArray())
                .stream()
                .filter(entry -> entry.getValue() != null)
                .collect(java.util.stream.Collectors.toUnmodifiableMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public Optional<MediaAssetBinding> findBinding(MediaAssetPurpose bindingType, long targetId) {
        return queryOne(
                "SELECT id, asset_id, binding_type, target_id, created_by_user_id, created_at "
                        + "FROM novel_media_asset_binding WHERE binding_type = ? AND target_id = ?",
                BINDING_MAPPER,
                bindingType.name(),
                targetId);
    }

    public void replaceBinding(UUID assetId, MediaAssetPurpose bindingType, long targetId, long operatorUserId) {
        jdbc.update(
                "DELETE FROM novel_media_asset_binding WHERE binding_type = ? AND target_id = ?",
                bindingType.name(),
                targetId);
        jdbc.update(
                "INSERT INTO novel_media_asset_binding(asset_id, binding_type, target_id, created_by_user_id, created_at) "
                        + "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                assetId.toString(),
                bindingType.name(),
                targetId,
                operatorUserId);
    }

    public void removeBinding(MediaAssetPurpose bindingType, long targetId) {
        jdbc.update("DELETE FROM novel_media_asset_binding WHERE binding_type = ? AND target_id = ?", bindingType.name(), targetId);
    }

    public void updateAssetState(UUID assetId, MediaAssetState state, Instant at) {
        int changed = jdbc.update(
                "UPDATE novel_media_asset SET state = ?, updated_at = CURRENT_TIMESTAMP, "
                        + "archived_at = CASE WHEN ? = 'ARCHIVED' THEN ? ELSE archived_at END, "
                        + "deleted_at = CASE WHEN ? = 'DELETED' THEN ? ELSE deleted_at END WHERE id = ?",
                state.name(),
                state.name(),
                Timestamp.from(at),
                state.name(),
                Timestamp.from(at),
                assetId.toString());
        if (changed != 1) throw new java.util.NoSuchElementException("media asset not found");
    }

    public void recordAssetAudit(UUID assetId, String action, String details, Long operatorUserId) {
        jdbc.update(
                "INSERT INTO novel_media_asset_audit(asset_id, action, details, operator_user_id, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
                assetId.toString(), action, details, operatorUserId);
    }

    public List<MediaAssetAudit> findAssetAudits(UUID assetId, int limit) {
        return jdbc.query(
                "SELECT id, asset_id, action, details, operator_user_id, created_at FROM novel_media_asset_audit "
                        + "WHERE asset_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                ASSET_AUDIT_MAPPER,
                assetId.toString(),
                limit);
    }

    public void createGcTask(UUID assetId, Instant dueAt) {
        jdbc.update(
                "INSERT INTO novel_media_gc_task(asset_id, status, due_at, attempt_count, created_at, updated_at) "
                        + "VALUES (?, 'PENDING', ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                assetId.toString(), Timestamp.from(dueAt));
    }

    /** Claims a bounded number of due tasks. This is deliberately idempotent on worker retries. */
    public List<MediaGcTask> lockDueGcTasks(Instant now, int limit) {
        return jdbc.query(
                "SELECT id, asset_id, status, due_at, attempt_count, last_error, claimed_at, completed_at "
                        + "FROM novel_media_gc_task WHERE status = 'PENDING' AND due_at <= ? "
                        + "ORDER BY due_at ASC, id ASC LIMIT ? FOR UPDATE",
                GC_TASK_MAPPER,
                Timestamp.from(now),
                limit);
    }

    public void markGcTaskRunning(long taskId) {
        jdbc.update(
                "UPDATE novel_media_gc_task SET status = 'RUNNING', attempt_count = attempt_count + 1, claimed_at = CURRENT_TIMESTAMP, "
                        + "updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'",
                taskId);
    }

    public void markGcTaskSucceeded(long taskId) {
        jdbc.update(
                "UPDATE novel_media_gc_task SET status = 'SUCCEEDED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND status = 'RUNNING'",
                taskId);
    }

    public void markGcTaskCancelled(long taskId) {
        jdbc.update(
                "UPDATE novel_media_gc_task SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND status IN ('PENDING', 'RUNNING')",
                taskId);
    }

    public void rescheduleGcTask(long taskId, Instant retryAt, String error) {
        jdbc.update(
                "UPDATE novel_media_gc_task SET status = 'PENDING', due_at = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND status = 'RUNNING'",
                Timestamp.from(retryAt), truncate(error, 1024), taskId);
    }

    public void cancelOutstandingGcTasks(UUID assetId) {
        jdbc.update(
                "UPDATE novel_media_gc_task SET status = 'CANCELLED', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE asset_id = ? AND status IN ('PENDING', 'RUNNING')",
                assetId.toString());
    }

    /** A process may die between claiming an object and completing its non-transactional delete. */
    public void requeueExpiredGcLeases(Instant leaseExpiredBefore) {
        jdbc.update(
                "UPDATE novel_media_gc_task SET status = 'PENDING', due_at = CURRENT_TIMESTAMP, "
                        + "last_error = 'worker lease expired', updated_at = CURRENT_TIMESTAMP "
                        + "WHERE status = 'RUNNING' AND claimed_at < ?",
                Timestamp.from(leaseExpiredBefore));
    }

    public void lockCarouselOrdering() {
        Integer lockId = jdbc.queryForObject(
                "SELECT id FROM novel_home_carousel_operation_lock WHERE id = 1 FOR UPDATE",
                Integer.class);
        if (lockId == null) throw new IllegalStateException("home carousel operation lock is unavailable");
        jdbc.update("UPDATE novel_home_carousel_operation_lock SET updated_at = CURRENT_TIMESTAMP WHERE id = 1");
    }

    public List<CarouselRow> lockCarouselRows() {
        return jdbc.query(
                "SELECT id, book_id, headline, copy_text, enabled, display_rank, version "
                        + "FROM novel_home_carousel_slide ORDER BY display_rank ASC, id ASC FOR UPDATE",
                CAROUSEL_ROW_MAPPER);
    }

    public Optional<CarouselRow> findCarouselRowForUpdate(long slideId) {
        return queryOne(
                "SELECT id, book_id, headline, copy_text, enabled, display_rank, version "
                        + "FROM novel_home_carousel_slide WHERE id = ? FOR UPDATE",
                CAROUSEL_ROW_MAPPER,
                slideId);
    }

    public CarouselRow createCarouselRow(
            long bookId,
            String headline,
            String copy,
            boolean enabled,
            int temporaryRank,
            long operatorUserId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO novel_home_carousel_slide(book_id, headline, copy_text, enabled, display_rank, "
                            + "version, created_by_user_id, updated_by_user_id, created_at, updated_at) "
                            + "VALUES (?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    Statement.RETURN_GENERATED_KEYS);
            statement.setLong(1, bookId);
            statement.setString(2, headline);
            statement.setString(3, copy);
            statement.setBoolean(4, enabled);
            statement.setInt(5, temporaryRank);
            statement.setLong(6, operatorUserId);
            statement.setLong(7, operatorUserId);
            return statement;
        }, keyHolder);
        return findCarouselRowForUpdate(generatedId(keyHolder, "home carousel slide"))
                .orElseThrow(() -> new IllegalStateException("home carousel slide was not saved"));
    }

    public void updateCarouselRow(
            long slideId,
            long bookId,
            String headline,
            String copy,
            boolean enabled,
            long expectedVersion,
            long operatorUserId) {
        int changed = jdbc.update(
                "UPDATE novel_home_carousel_slide SET book_id = ?, headline = ?, copy_text = ?, enabled = ?, "
                        + "version = version + 1, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP "
                        + "WHERE id = ? AND version = ?",
                bookId,
                headline,
                copy,
                enabled,
                operatorUserId,
                slideId,
                expectedVersion);
        if (changed == 0) throw new IllegalStateException("home carousel slide changed by another operator");
    }

    public void parkCarouselRanks(List<CarouselRow> rows) {
        for (int index = 0; index < rows.size(); index++) {
            jdbc.update(
                    "UPDATE novel_home_carousel_slide SET display_rank = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    temporaryRank(index), rows.get(index).id());
        }
    }

    public void writeCarouselRanks(List<CarouselRow> rows, long operatorUserId) {
        for (int index = 0; index < rows.size(); index++) {
            jdbc.update(
                    "UPDATE novel_home_carousel_slide SET display_rank = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    index + 1, operatorUserId, rows.get(index).id());
        }
    }

    public void deleteCarouselRow(long slideId, long expectedVersion) {
        int changed = jdbc.update("DELETE FROM novel_home_carousel_slide WHERE id = ? AND version = ?", slideId, expectedVersion);
        if (changed == 0) throw new IllegalStateException("home carousel slide changed by another operator");
    }

    public List<CarouselSlideData> findCarouselSlides() {
        return jdbc.query(slideProjectionSql(false), SLIDE_MAPPER);
    }

    public List<CarouselSlideData> findPublicCarouselSlides(int limit) {
        return jdbc.query(slideProjectionSql(true) + " LIMIT ?", SLIDE_MAPPER, limit);
    }

    public Optional<Book> findBookForUpdate(long bookId) {
        return queryOne("SELECT " + rawBookColumns() + " FROM novel_book WHERE id = ? FOR UPDATE", rawBookMapper(), bookId);
    }

    public Optional<Book> findBook(long bookId) {
        return queryOne("SELECT " + rawBookColumns() + " FROM novel_book WHERE id = ?", rawBookMapper(), bookId);
    }

    public void recordCarouselAudit(long slideId, long bookId, String action, String details, Long operatorUserId) {
        jdbc.update(
                "INSERT INTO novel_home_carousel_audit(slide_id, book_id, action, details, operator_user_id, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                slideId, bookId, action, details, operatorUserId);
    }

    public List<HomeCarouselSlideAudit> findCarouselAudits(int limit) {
        return jdbc.query(
                "SELECT id, slide_id, book_id, action, details, operator_user_id, created_at "
                        + "FROM novel_home_carousel_audit ORDER BY created_at DESC, id DESC LIMIT ?",
                CAROUSEL_AUDIT_MAPPER,
                limit);
    }

    /** Called by the publication lifecycle when a work leaves the public catalog. */
    public List<CarouselRow> disableCarouselRowsForBook(long bookId) {
        return jdbc.query(
                "SELECT id, book_id, headline, copy_text, enabled, display_rank, version "
                        + "FROM novel_home_carousel_slide WHERE book_id = ? AND enabled = TRUE FOR UPDATE",
                CAROUSEL_ROW_MAPPER,
                bookId);
    }

    public void setCarouselRowEnabled(long slideId, boolean enabled, long operatorUserId) {
        jdbc.update(
                "UPDATE novel_home_carousel_slide SET enabled = ?, version = version + 1, updated_by_user_id = ?, "
                        + "updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                enabled, operatorUserId, slideId);
    }

    public static int temporaryRank(int index) {
        if (index < 0 || index >= MAX_RANK) throw new IllegalStateException("too many carousel ranks to rewrite safely");
        return TEMPORARY_RANK_BASE + index;
    }

    public record CarouselRow(
            long id,
            long bookId,
            String headline,
            String copy,
            boolean enabled,
            int rank,
            long version) {
        CarouselRow withRank(int replacementRank) {
            return new CarouselRow(id, bookId, headline, copy, enabled, replacementRank, version);
        }
    }

    /** Internal raw catalog row; {@link BookPresentationService} adds interaction metrics at the service boundary. */
    public record CarouselSlideData(
            long slideId,
            Book book,
            UUID bannerAssetId,
            String bannerUrl,
            String headline,
            String copy,
            boolean enabled,
            int rank,
            long version,
            Instant createdAt,
            Instant updatedAt) { }

    public record MediaGcTask(
            long id,
            UUID assetId,
            String status,
            Instant dueAt,
            int attemptCount,
            String lastError,
            Instant claimedAt,
            Instant completedAt) { }

    public record CandidatePage(List<BookCoverCandidate> items, long total, int page, int size) {
        public CandidatePage {
            items = List.copyOf(items);
        }
    }

    private static final RowMapper<MediaGcTask> GC_TASK_MAPPER = (resultSet, rowNumber) -> new MediaGcTask(
            resultSet.getLong("id"),
            UUID.fromString(resultSet.getString("asset_id")),
            resultSet.getString("status"),
            instant(resultSet.getTimestamp("due_at")),
            resultSet.getInt("attempt_count"),
            resultSet.getString("last_error"),
            instant(resultSet.getTimestamp("claimed_at")),
            instant(resultSet.getTimestamp("completed_at")));

    private static String assetColumns() {
        return "id, owner_scope, owner_user_id, purpose, object_key, public_url, sha256, content_type, width, height, "
                + "byte_size, label, state, created_at, updated_at, archived_at, deleted_at";
    }

    private static String coverCandidateColumns() {
        return "id, book_id, asset_id, approved_asset_id, status, review_reason, created_by_user_id, created_at, "
                + "reviewed_by_user_id, reviewed_at";
    }

    private static String rawBookColumns() {
        return "id, title, author_name, category, word_count, serial_status, synopsis, NULL AS cover, status, author_id, heat, purchase_price";
    }

    private static RowMapper<Book> rawBookMapper() {
        return (resultSet, rowNumber) -> new Book(
                resultSet.getLong("id"),
                resultSet.getString("title"),
                resultSet.getString("author_name"),
                resultSet.getString("category"),
                resultSet.getInt("word_count"),
                resultSet.getString("serial_status"),
                resultSet.getString("synopsis"),
                null,
                BookStatus.valueOf(resultSet.getString("status")),
                resultSet.getLong("author_id"),
                resultSet.getLong("heat"),
                resultSet.getLong("purchase_price"));
    }

    private static String slideProjectionSql(boolean publicOnly) {
        String sql = "SELECT s.id AS slide_id, binding.asset_id AS banner_asset_id, s.headline, s.copy_text, s.enabled, s.display_rank, s.version, "
                + "s.created_at, s.updated_at, ma.public_url AS banner_url, " + BOOK_COLUMNS + " "
                + "FROM novel_home_carousel_slide s "
                + "JOIN novel_book b ON b.id = s.book_id "
                + "LEFT JOIN novel_media_asset_binding binding ON binding.binding_type = 'HOME_CAROUSEL_BANNER' AND binding.target_id = s.id "
                + "LEFT JOIN novel_media_asset ma ON ma.id = binding.asset_id AND ma.state = 'ACTIVE' ";
        if (publicOnly) {
            sql += "WHERE s.enabled = TRUE AND b.status = 'PUBLISHED' AND EXISTS (SELECT 1 FROM novel_chapter public_chapter WHERE public_chapter.book_id = b.id AND public_chapter.published = TRUE AND public_chapter.status = 'PUBLISHED') ORDER BY s.display_rank ASC, s.id ASC";
        } else {
            sql += "ORDER BY s.display_rank ASC, s.id ASC";
        }
        return sql;
    }

    private <T> Optional<T> queryOne(String sql, RowMapper<T> mapper, Object... arguments) {
        return jdbc.query(sql, mapper, arguments).stream().findFirst();
    }

    private static UUID uuid(String value) {
        return value == null ? null : UUID.fromString(value);
    }

    private static Instant instant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static String truncate(String value, int maxLength) {
        if (value == null) return null;
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    private static String escapeLike(String value) {
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private static MediaAsset mediaAsset(MediaAssetPageMapper.MediaAssetRow row) {
        return new MediaAsset(
                UUID.fromString(row.getId()),
                MediaAssetOwnerScope.valueOf(row.getOwnerScope()),
                row.getOwnerUserId(),
                MediaAssetPurpose.valueOf(row.getPurpose()),
                row.getObjectKey(),
                row.getPublicUrl(),
                row.getSha256(),
                row.getContentType(),
                row.getWidth(),
                row.getHeight(),
                row.getByteSize(),
                row.getLabel(),
                MediaAssetState.valueOf(row.getState()),
                instant(row.getCreatedAt()),
                instant(row.getUpdatedAt()),
                instant(row.getArchivedAt()),
                instant(row.getDeletedAt()));
    }

    private static BookCoverCandidate coverCandidate(MediaAssetPageMapper.CoverCandidateRow row) {
        return new BookCoverCandidate(
                row.getId(),
                row.getBookId(),
                UUID.fromString(row.getAssetId()),
                uuid(row.getApprovedAssetId()),
                BookCoverCandidateStatus.valueOf(row.getStatus()),
                row.getReviewReason(),
                row.getCreatedByUserId(),
                instant(row.getCreatedAt()),
                row.getReviewedByUserId(),
                instant(row.getReviewedAt()));
    }

    private static long generatedId(KeyHolder keyHolder, String label) {
        if (keyHolder.getKeyList().isEmpty()) throw new IllegalStateException("database did not return a generated " + label + " id");
        Map<String, Object> keys = keyHolder.getKeyList().getFirst();
        Object value = keys.entrySet().stream()
                .filter(entry -> entry.getKey().equalsIgnoreCase("id"))
                .map(Map.Entry::getValue)
                .findFirst()
                .orElseGet(() -> keys.values().stream().filter(Number.class::isInstance).findFirst().orElse(null));
        if (!(value instanceof Number number)) throw new IllegalStateException("database did not return a numeric " + label + " id");
        return number.longValue();
    }
}
