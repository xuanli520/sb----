package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookCoverCandidate;
import cn.edu.training.novel.domain.BookCoverCandidateQueueItem;
import cn.edu.training.novel.domain.BookCoverCandidateStatus;
import cn.edu.training.novel.domain.CoverCandidateReviewResult;
import cn.edu.training.novel.domain.CoverCandidatePage;
import cn.edu.training.novel.domain.MediaAsset;
import cn.edu.training.novel.domain.MediaAssetAudit;
import cn.edu.training.novel.domain.MediaAssetBinding;
import cn.edu.training.novel.domain.MediaAssetOwnerScope;
import cn.edu.training.novel.domain.MediaAssetPurpose;
import cn.edu.training.novel.domain.MediaAssetState;
import cn.edu.training.novel.domain.MediaAssetPage;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/** Lifecycle owner for station media. Objects are immutable; replacements change bindings only. */
@Service
public class MediaAssetService {
    private static final int MAX_LIST_LIMIT = 100;
    private static final Duration DELETE_GRACE = Duration.ofDays(7);
    private static final Duration GC_CLAIM_LEASE = Duration.ofMinutes(10);
    private static final Pattern COVER_OBJECT_KEY = Pattern.compile("covers/[0-9a-fA-F-]{36}\\.(?:png|jpg)");
    private static final Pattern BANNER_OBJECT_KEY = Pattern.compile("banners/[0-9a-fA-F-]{36}\\.(?:png|jpg)");
    private static final Pattern STAGING_COVER_OBJECT_KEY = Pattern.compile("staging/[0-9a-fA-F-]{36}\\.(?:png|jpg)");

    private final MediaCarouselRepository repository;
    private final CoverObjectStorage storage;
    private final CoverImageValidator imageValidator;
    private final AuditTrail auditTrail;

    public MediaAssetService(
            MediaCarouselRepository repository,
            CoverObjectStorage storage,
            CoverImageValidator imageValidator,
            AuditTrail auditTrail) {
        this.repository = repository;
        this.storage = storage;
        this.imageValidator = imageValidator;
        this.auditTrail = auditTrail;
    }

    @Transactional
    public MediaAsset uploadPlatformBanner(long administratorUserId, MultipartFile file, String label) {
        CoverImage image = imageValidator.validateBanner(file);
        CoverObjectStorage.StoredCover uploaded = storage.storeBanner(image);
        requireStoredPath(uploaded, BANNER_OBJECT_KEY, "banners");
        MediaAsset asset = new MediaAsset(
                UUID.randomUUID(),
                MediaAssetOwnerScope.PLATFORM,
                null,
                MediaAssetPurpose.HOME_CAROUSEL_BANNER,
                uploaded.objectKey(),
                uploaded.publicUrl(),
                sha256(image.bytes()),
                image.contentType(),
                image.width(),
                image.height(),
                image.bytes().length,
                normalizeLabel(label),
                MediaAssetState.ACTIVE,
                null,
                null,
                null,
                null);
        try {
            MediaAsset saved = repository.createAsset(asset);
            repository.recordAssetAudit(saved.id(), "UPLOADED", "platform home-carousel banner uploaded", administratorUserId);
            auditTrail.record("media banner uploaded asset=" + saved.id() + " operator=" + administratorUserId);
            scheduleRollbackCompensation(uploaded.publicUrl());
            return saved;
        } catch (RuntimeException exception) {
            deleteNewPublicObjectQuietly(uploaded.publicUrl());
            throw exception;
        }
    }

    public MediaAssetPage platformBannerAssets(MediaAssetState state, String query, int page, int size) {
        requirePage(page, size);
        if (query != null && query.trim().length() > 128) {
            throw new IllegalArgumentException("media search query must be at most 128 characters");
        }
        return repository.findPlatformBannerAssets(state, query, page, size);
    }

    public MediaAsset asset(UUID assetId) {
        return repository.findAsset(assetId).orElseThrow(() -> new NoSuchElementException("media asset not found"));
    }

    /** The stationmaster asset library is deliberately isolated from author-owned cover media. */
    public MediaAsset platformBannerAsset(UUID assetId) {
        MediaAsset asset = asset(assetId);
        requirePlatformBanner(asset);
        return asset;
    }

    public List<MediaAssetBinding> bindings(UUID assetId) {
        asset(assetId);
        return repository.findBindings(assetId);
    }

    public List<MediaAssetBinding> platformBannerBindings(UUID assetId) {
        platformBannerAsset(assetId);
        return repository.findBindings(assetId);
    }

    public List<MediaAssetAudit> audits(UUID assetId, int limit) {
        asset(assetId);
        return repository.findAssetAudits(assetId, normalizeLimit(limit));
    }

    public List<MediaAssetAudit> platformBannerAudits(UUID assetId, int limit) {
        platformBannerAsset(assetId);
        return repository.findAssetAudits(assetId, normalizeLimit(limit));
    }

    @Transactional
    public MediaAsset archivePlatformBanner(long administratorUserId, UUID assetId) {
        MediaAsset asset = lockPlatformBanner(assetId);
        requireUnbound(asset.id(), "media asset cannot be archived while it is in use");
        if (asset.state() == MediaAssetState.DELETED || asset.state() == MediaAssetState.PENDING_DELETE) {
            throw new IllegalStateException("media asset cannot be archived in its current lifecycle state");
        }
        if (asset.state() == MediaAssetState.ACTIVE) {
            repository.updateAssetState(asset.id(), MediaAssetState.ARCHIVED, Instant.now());
            repository.recordAssetAudit(asset.id(), "ARCHIVED", "platform banner archived", administratorUserId);
            auditTrail.record("media banner archived asset=" + asset.id() + " operator=" + administratorUserId);
        }
        return asset(asset.id());
    }

    /** A delete request is recoverable: it first enters a grace period and then the GC worker removes bytes. */
    @Transactional
    public MediaAsset requestDeletePlatformBanner(long administratorUserId, UUID assetId) {
        MediaAsset asset = lockPlatformBanner(assetId);
        requireUnbound(asset.id(), "media asset cannot be deleted while it is in use");
        if (asset.state() == MediaAssetState.DELETED) return asset;
        if (asset.state() != MediaAssetState.PENDING_DELETE) {
            Instant now = Instant.now();
            repository.updateAssetState(asset.id(), MediaAssetState.PENDING_DELETE, now);
            repository.createGcTask(asset.id(), now.plus(DELETE_GRACE));
            repository.recordAssetAudit(asset.id(), "DELETE_REQUESTED", "platform banner queued for deferred deletion", administratorUserId);
            auditTrail.record("media banner delete requested asset=" + asset.id() + " operator=" + administratorUserId);
        }
        return asset(asset.id());
    }

    /** Cancels deferred deletion before the garbage collector has removed the immutable object. */
    @Transactional
    public MediaAsset restorePlatformBanner(long administratorUserId, UUID assetId) {
        MediaAsset asset = lockPlatformBanner(assetId);
        requireUnbound(asset.id(), "media asset cannot be restored while it is in use");
        if (asset.state() == MediaAssetState.DELETED) {
            throw new IllegalStateException("deleted media asset cannot be restored");
        }
        if (asset.state() == MediaAssetState.ARCHIVED || asset.state() == MediaAssetState.PENDING_DELETE) {
            repository.updateAssetState(asset.id(), MediaAssetState.ACTIVE, Instant.now());
            repository.cancelOutstandingGcTasks(asset.id());
            repository.recordAssetAudit(asset.id(), "RESTORED", "platform banner restored for reuse", administratorUserId);
            auditTrail.record("media banner restored asset=" + asset.id() + " operator=" + administratorUserId);
        }
        return asset(asset.id());
    }

    /** Requires a platform banner to be active before a carousel service binds it. */
    MediaAsset requireActivePlatformBannerForBinding(UUID assetId) {
        MediaAsset asset = lockPlatformBanner(assetId);
        if (asset.state() != MediaAssetState.ACTIVE) {
            throw new IllegalStateException("home carousel banner asset is not active");
        }
        return asset;
    }

    void replaceCarouselBannerBinding(long operatorUserId, long slideId, UUID assetId) {
        MediaAssetBinding previous = repository.findBinding(MediaAssetPurpose.HOME_CAROUSEL_BANNER, slideId).orElse(null);
        if (previous != null && previous.assetId().equals(assetId)) return;
        if (assetId != null) requireActivePlatformBannerForBinding(assetId);
        if (previous != null) {
            repository.removeBinding(MediaAssetPurpose.HOME_CAROUSEL_BANNER, slideId);
            repository.recordAssetAudit(previous.assetId(), "UNBOUND", "home carousel slide=" + slideId, operatorUserId);
        }
        if (assetId != null) {
            repository.replaceBinding(assetId, MediaAssetPurpose.HOME_CAROUSEL_BANNER, slideId, operatorUserId);
            repository.recordAssetAudit(assetId, "BOUND", "home carousel slide=" + slideId, operatorUserId);
        }
    }

    void removeCarouselBannerBinding(long operatorUserId, long slideId) {
        MediaAssetBinding previous = repository.findBinding(MediaAssetPurpose.HOME_CAROUSEL_BANNER, slideId).orElse(null);
        if (previous == null) return;
        repository.removeBinding(MediaAssetPurpose.HOME_CAROUSEL_BANNER, slideId);
        repository.recordAssetAudit(previous.assetId(), "UNBOUND", "home carousel slide=" + slideId + " removed", operatorUserId);
    }

    /** Registers a newly uploaded author cover and atomically moves the one current book binding. */
    MediaAsset registerAuthorBookCover(
            long authorUserId,
            long bookId,
            CoverObjectStorage.StoredCover uploaded,
            CoverImage image) {
        requireStoredPath(uploaded, COVER_OBJECT_KEY, "covers");
        MediaAsset asset = new MediaAsset(
                UUID.randomUUID(),
                MediaAssetOwnerScope.AUTHOR,
                authorUserId,
                MediaAssetPurpose.BOOK_COVER,
                uploaded.objectKey(),
                uploaded.publicUrl(),
                sha256(image.bytes()),
                image.contentType(),
                image.width(),
                image.height(),
                image.bytes().length,
                null,
                MediaAssetState.ACTIVE,
                null,
                null,
                null,
                null);
        MediaAsset saved = repository.createAsset(asset);
        bindAuthorBookCover(authorUserId, bookId, saved, "book cover replaced");
        return saved;
    }

    /** Called while a draft/rejected work is deleted so its no-longer-referenced cover can be reclaimed. */
    void removeAuthorBookCoverForDeletedBook(long authorUserId, long bookId) {
        MediaAssetBinding binding = repository.findBinding(MediaAssetPurpose.BOOK_COVER, bookId).orElse(null);
        if (binding == null) return;
        MediaAsset asset = repository.findAssetForUpdate(binding.assetId())
                .orElseThrow(() -> new IllegalStateException("book cover asset is missing"));
        if (asset.ownerScope() != MediaAssetOwnerScope.AUTHOR
                || asset.ownerUserId() == null
                || asset.ownerUserId() != authorUserId
                || asset.purpose() != MediaAssetPurpose.BOOK_COVER) {
            throw new IllegalStateException("book cover binding is inconsistent");
        }
        repository.removeBinding(MediaAssetPurpose.BOOK_COVER, bookId);
        repository.recordAssetAudit(asset.id(), "UNBOUND", "book deleted book=" + bookId, authorUserId);
        retireIfUnbound(asset.id(), authorUserId, "book deleted book=" + bookId);
    }

    /** Stages a published-work replacement without creating a public URL or changing its cover binding. */
    BookCoverCandidate stagePublishedBookCoverCandidate(long authorUserId, Book book, CoverImage image) {
        if (book.authorId() != authorUserId) {
            throw new SecurityException("resource does not belong to current author");
        }
        CoverObjectStorage.StoredStagedCover staged = storage.storeStagingCover(image);
        requireStagingPath(staged);
        MediaAsset candidateAsset = new MediaAsset(
                UUID.randomUUID(),
                MediaAssetOwnerScope.AUTHOR,
                authorUserId,
                MediaAssetPurpose.BOOK_COVER_CANDIDATE,
                staged.objectKey(),
                null,
                sha256(image.bytes()),
                image.contentType(),
                image.width(),
                image.height(),
                image.bytes().length,
                null,
                MediaAssetState.ACTIVE,
                null,
                null,
                null,
                null);
        try {
            // A work has at most one actionable proposal. Rejected evidence is intentionally left
            // attached and previewable, while an older pending proposal is superseded audibly.
            for (BookCoverCandidate previous : repository.findPendingCoverCandidatesByBookIdForUpdate(book.id())) {
                repository.resolveCoverCandidate(
                        previous.id(),
                        BookCoverCandidateStatus.SUPERSEDED,
                        "superseded by a newer cover candidate",
                        authorUserId,
                        Instant.now(),
                        null);
                repository.removeBinding(MediaAssetPurpose.BOOK_COVER_CANDIDATE, previous.id());
                repository.recordAssetAudit(previous.assetId(), "SUPERSEDED", "book cover candidate=" + previous.id(), authorUserId);
                retireIfUnbound(previous.assetId(), authorUserId, "book cover candidate superseded");
            }
            MediaAsset savedAsset = repository.createAsset(candidateAsset);
            repository.recordAssetAudit(savedAsset.id(), "UPLOADED", "private published-book cover candidate", authorUserId);
            BookCoverCandidate candidate = repository.createCoverCandidate(new BookCoverCandidate(
                    0,
                    book.id(),
                    savedAsset.id(),
                    null,
                    BookCoverCandidateStatus.PENDING_REVIEW,
                    null,
                    authorUserId,
                    null,
                    null,
                    null));
            repository.replaceBinding(
                    savedAsset.id(), MediaAssetPurpose.BOOK_COVER_CANDIDATE, candidate.id(), authorUserId);
            repository.recordAssetAudit(savedAsset.id(), "BOUND", "book cover candidate=" + candidate.id(), authorUserId);
            auditTrail.record("private cover candidate uploaded candidate=" + candidate.id() + " book=" + book.id()
                    + " author=" + authorUserId);
            scheduleRollbackObjectCompensation(staged.objectKey());
            return candidate;
        } catch (RuntimeException exception) {
            deleteNewObjectKeyQuietly(staged.objectKey());
            throw exception;
        }
    }

    public List<BookCoverCandidate> authorBookCoverCandidates(long authorUserId, long bookId) {
        Book book = repository.findBook(bookId).orElseThrow(() -> new NoSuchElementException("book not found"));
        if (book.authorId() != authorUserId) throw new SecurityException("resource does not belong to current author");
        return repository.findCoverCandidatesByBookId(bookId);
    }

    public CoverObjectStorage.StoredMedia authorCoverCandidatePreview(long authorUserId, long bookId, long candidateId) {
        BookCoverCandidate candidate = repository.findCoverCandidateById(candidateId)
                .orElseThrow(() -> new NoSuchElementException("book cover candidate not found"));
        if (candidate.bookId() != bookId) throw new NoSuchElementException("book cover candidate not found");
        Book book = repository.findBook(bookId).orElseThrow(() -> new NoSuchElementException("book not found"));
        if (book.authorId() != authorUserId) throw new SecurityException("resource does not belong to current author");
        return openCandidatePreview(candidate);
    }

    public CoverObjectStorage.StoredMedia administratorCoverCandidatePreview(long candidateId) {
        return openCandidatePreview(repository.findCoverCandidateById(candidateId)
                .orElseThrow(() -> new NoSuchElementException("book cover candidate not found")));
    }

    public CoverCandidatePage coverCandidatePage(BookCoverCandidateStatus status, int page, int size) {
        requirePage(page, size);
        MediaCarouselRepository.CandidatePage source = repository.findCoverCandidatePage(status, page, size);
        java.util.Map<Long, Book> booksById = repository.findBooksByIds(
                source.items().stream().map(BookCoverCandidate::bookId).toList());
        List<BookCoverCandidateQueueItem> items = source.items().stream()
                .map(candidate -> {
                    Book book = booksById.get(candidate.bookId());
                    return book == null ? null : new BookCoverCandidateQueueItem(BookCoverCandidateQueueItem.SCOPE, book, candidate);
                })
                .filter(java.util.Objects::nonNull)
                .toList();
        return new CoverCandidatePage(items, new MediaAssetPage.Meta(source.total(), source.page(), source.size()));
    }

    @Transactional
    public CoverCandidateReviewResult reviewCoverCandidate(
            long administratorUserId,
            long candidateId,
            boolean approve,
            String reason) {
        BookCoverCandidate located = repository.findCoverCandidateById(candidateId)
                .orElseThrow(() -> new NoSuchElementException("book cover candidate not found"));
        Book book = repository.findBookForUpdate(located.bookId())
                .orElseThrow(() -> new NoSuchElementException("book not found"));
        BookCoverCandidate candidate = repository.findCoverCandidateByIdForUpdate(candidateId)
                .orElseThrow(() -> new NoSuchElementException("book cover candidate not found"));
        if (candidate.status() != BookCoverCandidateStatus.PENDING_REVIEW) {
            throw new IllegalStateException("book cover candidate has already been reviewed");
        }
        String normalizedReason = normalizeReviewReason(reason);
        Instant reviewedAt = Instant.now();
        MediaAsset stagedAsset = repository.findAssetForUpdate(candidate.assetId())
                .orElseThrow(() -> new NoSuchElementException("cover candidate asset not found"));
        requireCandidateAsset(stagedAsset, book, candidate);
        if (!approve) {
            repository.resolveCoverCandidate(
                    candidate.id(), BookCoverCandidateStatus.REJECTED, normalizedReason, administratorUserId, reviewedAt, null);
            repository.recordAssetAudit(stagedAsset.id(), "REJECTED", "book cover candidate=" + candidate.id(), administratorUserId);
            auditTrail.record("book cover candidate rejected candidate=" + candidate.id() + " book=" + book.id()
                    + " operator=" + administratorUserId);
            return new CoverCandidateReviewResult(book, resolvedCandidate(candidate.id()));
        }
        if (book.status() != cn.edu.training.novel.domain.BookStatus.PUBLISHED) {
            throw new IllegalStateException("only published books can receive an approved cover replacement");
        }

        CoverObjectStorage.StoredCover promoted = storage.promoteStagingCover(stagedAsset.objectKey());
        requireStoredPath(promoted, COVER_OBJECT_KEY, "covers");
        try {
            MediaAsset approvedAsset = repository.createAsset(new MediaAsset(
                    UUID.randomUUID(),
                    MediaAssetOwnerScope.AUTHOR,
                    book.authorId(),
                    MediaAssetPurpose.BOOK_COVER,
                    promoted.objectKey(),
                    promoted.publicUrl(),
                    stagedAsset.sha256(),
                    stagedAsset.contentType(),
                    stagedAsset.width(),
                    stagedAsset.height(),
                    stagedAsset.byteSize(),
                    null,
                    MediaAssetState.ACTIVE,
                    null,
                    null,
                    null,
                    null));
            repository.recordAssetAudit(approvedAsset.id(), "PROMOTED", "from private cover candidate=" + candidate.id(), administratorUserId);
            bindAuthorBookCover(book.authorId(), book.id(), approvedAsset, "approved book cover candidate=" + candidate.id());
            repository.removeBinding(MediaAssetPurpose.BOOK_COVER_CANDIDATE, candidate.id());
            repository.recordAssetAudit(stagedAsset.id(), "UNBOUND", "approved book cover candidate=" + candidate.id(), administratorUserId);
            repository.resolveCoverCandidate(
                    candidate.id(),
                    BookCoverCandidateStatus.APPROVED,
                    normalizedReason,
                    administratorUserId,
                    reviewedAt,
                    approvedAsset.id());
            repository.recordAssetAudit(stagedAsset.id(), "PROMOTED", "approved asset=" + approvedAsset.id(), administratorUserId);
            retireIfUnbound(stagedAsset.id(), administratorUserId, "book cover candidate promoted");
            auditTrail.record("book cover candidate approved candidate=" + candidate.id() + " book=" + book.id()
                    + " operator=" + administratorUserId);
            scheduleRollbackCompensation(promoted.publicUrl());
            return new CoverCandidateReviewResult(book, resolvedCandidate(candidate.id()));
        } catch (RuntimeException exception) {
            deleteNewObjectKeyQuietly(promoted.objectKey());
            throw exception;
        }
    }

    private void bindAuthorBookCover(long authorUserId, long bookId, MediaAsset saved, String replacementDetails) {
        MediaAssetBinding previous = repository.findBinding(MediaAssetPurpose.BOOK_COVER, bookId).orElse(null);
        if (previous != null) {
            repository.removeBinding(MediaAssetPurpose.BOOK_COVER, bookId);
            repository.recordAssetAudit(previous.assetId(), "UNBOUND", "book cover replaced book=" + bookId, authorUserId);
            retireIfUnbound(previous.assetId(), authorUserId, replacementDetails);
        }
        repository.replaceBinding(saved.id(), MediaAssetPurpose.BOOK_COVER, bookId, authorUserId);
        repository.recordAssetAudit(saved.id(), "BOUND", "book cover book=" + bookId, authorUserId);
    }

    @Transactional
    public List<MediaCarouselRepository.MediaGcTask> claimDueGcTasks(Instant now, int limit) {
        repository.requeueExpiredGcLeases(now.minus(GC_CLAIM_LEASE));
        List<MediaCarouselRepository.MediaGcTask> tasks = repository.lockDueGcTasks(now, Math.max(1, Math.min(limit, 20)));
        for (MediaCarouselRepository.MediaGcTask task : tasks) {
            repository.markGcTaskRunning(task.id());
        }
        return tasks;
    }

    @Transactional
    public void completeGcTask(MediaCarouselRepository.MediaGcTask task, Long operatorUserId) {
        MediaAsset asset = repository.findAssetForUpdate(task.assetId()).orElse(null);
        if (asset == null || asset.state() == MediaAssetState.DELETED) {
            repository.markGcTaskSucceeded(task.id());
            return;
        }
        if (asset.state() != MediaAssetState.PENDING_DELETE || !repository.findBindings(asset.id()).isEmpty()) {
            repository.markGcTaskCancelled(task.id());
            return;
        }
        try {
            storage.deleteManagedObject(asset.objectKey());
            repository.updateAssetState(asset.id(), MediaAssetState.DELETED, Instant.now());
            repository.markGcTaskSucceeded(task.id());
            repository.recordAssetAudit(asset.id(), "DELETE_SUCCEEDED", "managed object removed by garbage collector", operatorUserId);
        } catch (RuntimeException exception) {
            repository.rescheduleGcTask(task.id(), Instant.now().plus(Duration.ofHours(1)), exception.getClass().getSimpleName());
            repository.recordAssetAudit(asset.id(), "DELETE_FAILED", "garbage collector will retry", operatorUserId);
        }
    }

    private MediaAsset lockPlatformBanner(UUID assetId) {
        MediaAsset asset = repository.findAssetForUpdate(assetId)
                .orElseThrow(() -> new NoSuchElementException("media asset not found"));
        requirePlatformBanner(asset);
        return asset;
    }

    private static void requirePlatformBanner(MediaAsset asset) {
        if (asset.ownerScope() != MediaAssetOwnerScope.PLATFORM
                || asset.purpose() != MediaAssetPurpose.HOME_CAROUSEL_BANNER) {
            throw new SecurityException("media asset is not a platform home-carousel banner");
        }
    }

    private void requireUnbound(UUID assetId, String message) {
        if (!repository.findBindings(assetId).isEmpty()) throw new IllegalStateException(message);
    }

    private void retireIfUnbound(UUID assetId, long operatorUserId, String details) {
        MediaAsset previous = repository.findAssetForUpdate(assetId).orElse(null);
        if (previous == null || previous.state() != MediaAssetState.ACTIVE || !repository.findBindings(assetId).isEmpty()) return;
        Instant now = Instant.now();
        repository.updateAssetState(assetId, MediaAssetState.PENDING_DELETE, now);
        repository.createGcTask(assetId, now.plus(DELETE_GRACE));
        repository.recordAssetAudit(assetId, "DELETE_REQUESTED", details, operatorUserId);
    }

    private void scheduleRollbackCompensation(String publicUrl) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) deleteNewPublicObjectQuietly(publicUrl);
            }
        });
    }

    private void scheduleRollbackObjectCompensation(String objectKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED) deleteNewObjectKeyQuietly(objectKey);
            }
        });
    }

    private void deleteNewPublicObjectQuietly(String publicUrl) {
        try {
            if (storage.isManaged(publicUrl)) storage.deleteManaged(publicUrl);
        } catch (RuntimeException ignored) {
            // A later object-store inventory/GC pass can clean an object after a transient failure.
        }
    }

    private void deleteNewObjectKeyQuietly(String objectKey) {
        try {
            storage.deleteManagedObject(objectKey);
        } catch (RuntimeException ignored) {
            // A later object-store inventory/GC pass can clean an object after a transient failure.
        }
    }

    private CoverObjectStorage.StoredMedia openCandidatePreview(BookCoverCandidate candidate) {
        if (candidate.status() != BookCoverCandidateStatus.PENDING_REVIEW
                && candidate.status() != BookCoverCandidateStatus.REJECTED) {
            throw new IllegalStateException("book cover candidate preview is no longer available");
        }
        MediaAsset asset = repository.findAsset(candidate.assetId())
                .orElseThrow(() -> new NoSuchElementException("cover candidate asset not found"));
        if (asset.state() != MediaAssetState.ACTIVE || asset.purpose() != MediaAssetPurpose.BOOK_COVER_CANDIDATE
                || !STAGING_COVER_OBJECT_KEY.matcher(asset.objectKey()).matches()) {
            throw new NoSuchElementException("cover candidate preview is unavailable");
        }
        return storage.openStagingCover(asset.objectKey());
    }

    private void requireCandidateAsset(MediaAsset asset, Book book, BookCoverCandidate candidate) {
        if (asset.ownerScope() != MediaAssetOwnerScope.AUTHOR
                || asset.ownerUserId() == null
                || asset.ownerUserId() != book.authorId()
                || asset.purpose() != MediaAssetPurpose.BOOK_COVER_CANDIDATE
                || asset.state() != MediaAssetState.ACTIVE
                || !STAGING_COVER_OBJECT_KEY.matcher(asset.objectKey()).matches()
                || asset.publicUrl() != null) {
            throw new IllegalStateException("book cover candidate asset is not eligible for review");
        }
        MediaAssetBinding binding = repository.findBinding(MediaAssetPurpose.BOOK_COVER_CANDIDATE, candidate.id())
                .orElseThrow(() -> new IllegalStateException("book cover candidate binding is missing"));
        if (!binding.assetId().equals(asset.id())) {
            throw new IllegalStateException("book cover candidate binding is inconsistent");
        }
    }

    private BookCoverCandidate resolvedCandidate(long candidateId) {
        return repository.findCoverCandidateById(candidateId)
                .orElseThrow(() -> new IllegalStateException("book cover candidate was not saved"));
    }

    private static void requireStagingPath(CoverObjectStorage.StoredStagedCover stored) {
        if (stored == null || stored.objectKey() == null || !STAGING_COVER_OBJECT_KEY.matcher(stored.objectKey()).matches()) {
            throw new IllegalStateException("media storage returned an invalid staging object path");
        }
    }

    private static void requirePage(int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be non-negative");
        if (size < 1 || size > MAX_LIST_LIMIT) {
            throw new IllegalArgumentException("size must be between 1 and " + MAX_LIST_LIMIT);
        }
        try {
            Math.multiplyExact(page, size);
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("page is out of range", exception);
        }
    }

    private static String normalizeReviewReason(String reason) {
        if (reason == null || reason.isBlank()) throw new IllegalArgumentException("cover candidate review reason is required");
        String normalized = reason.trim();
        if (normalized.length() > 900) throw new IllegalArgumentException("cover candidate review reason is too long");
        return normalized;
    }

    private static int normalizeLimit(int limit) {
        return Math.max(1, Math.min(limit, MAX_LIST_LIMIT));
    }

    private static String normalizeLabel(String label) {
        if (label == null || label.isBlank()) return null;
        String normalized = label.trim();
        if (normalized.length() > 128) throw new IllegalArgumentException("media asset label must be at most 128 characters");
        return normalized;
    }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder output = new StringBuilder(digest.length * 2);
            for (byte value : digest) output.append(String.format("%02x", value));
            return output.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is not available", exception);
        }
    }

    private static void requireStoredPath(
            CoverObjectStorage.StoredCover stored,
            Pattern objectKeyPattern,
            String kind) {
        if (stored == null
                || stored.objectKey() == null
                || !objectKeyPattern.matcher(stored.objectKey()).matches()
                || stored.publicUrl() == null
                || !stored.publicUrl().equals("/media/" + stored.objectKey())
                || !stored.objectKey().startsWith(kind + "/")) {
            throw new IllegalStateException("media storage returned an invalid managed object path");
        }
    }
}
