package cn.edu.training.novel.service;

import cn.edu.training.novel.config.ContentModerationProperties;
import cn.edu.training.novel.config.FullBookModerationProperties;
import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookModerationSnapshot;
import cn.edu.training.novel.domain.BookModerationSnapshotStatus;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Creates immutable whole-work moderation snapshots and processes one leased chunk at a time.
 * Provider calls deliberately happen between the short claim and completion transactions.
 */
@Service
public class BookModerationSnapshotService {
    private static final String BOUNDARY_CHUNK_TITLE = "Full-work snapshot boundary";

    private final BookModerationSnapshotRepository snapshotRepository;
    private final ContentModerationService moderationService;
    private final FullBookModerationProperties properties;
    private final ContentModerationProperties moderationProperties;
    private final TransactionTemplate transactions;

    public BookModerationSnapshotService(
            BookModerationSnapshotRepository snapshotRepository,
            ContentModerationService moderationService,
            FullBookModerationProperties properties,
            ContentModerationProperties moderationProperties,
            PlatformTransactionManager transactionManager) {
        this.snapshotRepository = snapshotRepository;
        this.moderationService = moderationService;
        this.properties = properties;
        this.moderationProperties = moderationProperties;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    /**
     * Replaces any prior current snapshot while the caller owns the book lock. It copies every
     * current chapter into bounded chunks; it never contacts Qwen in this transaction.
     */
    @Transactional
    public BookModerationSnapshot queueCurrentSnapshot(Book book, List<Chapter> liveChapters) {
        if (book == null) {
            throw new IllegalArgumentException("book is required");
        }
        SnapshotPlan plan = buildPlan(book, liveChapters);
        snapshotRepository.supersedeCurrentSnapshots(book.id());
        SnapshotCreation creation = snapshotRepository.create(
                book.id(),
                plan.contentVersionHash(),
                book.title(),
                book.synopsis(),
                plan.chunks());
        if (!plan.boundaryFailure()) {
            return creation.snapshot();
        }

        SnapshotChunk boundary = creation.chunks().getFirst();
        ContentModerationAudit audit = moderationService.persistPrepared(
                moderationService.prepareSnapshotBoundaryFailure(
                        boundary.id(), boundary.draft().contentVersionHash(), plan.inputCharacters()));
        Instant completedAt = Instant.now();
        snapshotRepository.completeUnclaimedChunk(creation.snapshot().id(), boundary.id(), audit.id(), completedAt);
        snapshotRepository.completeSnapshot(
                creation.snapshot().id(),
                ModerationDecision.MANUAL_REVIEW,
                "Full-work snapshot exceeded a configured safety bound and requires human review.",
                completedAt);
        return snapshotRepository.findCurrentByBookId(book.id())
                .orElseThrow(() -> new IllegalStateException("current snapshot disappeared during creation"));
    }

    /**
     * Processes a bounded number of queued chunks. Each model invocation occurs after a claim
     * transaction commits and before the short completion transaction begins.
     */
    public int processAvailableChunks() {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            throw new IllegalStateException("whole-work moderation processing must run outside an active transaction");
        }
        int processed = 0;
        for (int index = 0; index < properties.maxClaimsPerRun(); index++) {
            Optional<BookModerationChunkClaim> optionalClaim = transactions.execute(status ->
                    snapshotRepository.claimNext(Instant.now(), properties.claimLease()));
            if (optionalClaim == null || optionalClaim.isEmpty()) {
                break;
            }
            BookModerationChunkClaim claim = optionalClaim.get();

            // No transaction is active here. The request contains only the already copied chunk.
            ContentModerationAudit evaluated = moderationService.prepareSnapshotChunk(
                    claim.chunkId(), claim.contentVersionHash(), claim.title(), claim.content());
            Boolean accepted = transactions.execute(status -> completeClaim(claim, evaluated));
            if (Boolean.TRUE.equals(accepted)) {
                processed++;
            }
        }
        return processed;
    }

    /** Requires a terminal snapshot for exactly the supplied live work version. */
    public BookModerationSnapshot requireCurrentTerminalSnapshot(Book book, List<Chapter> liveChapters) {
        String currentHash = currentContentVersionHash(book, liveChapters);
        BookModerationSnapshot snapshot = snapshotRepository.findCurrentByBookIdForUpdate(book.id())
                .orElseThrow(() -> new IllegalStateException("full-work moderation snapshot is not available"));
        if (!snapshot.contentVersionHash().equals(currentHash)) {
            throw new IllegalStateException("full-work moderation snapshot is stale for the current book version");
        }
        if (snapshot.status() != BookModerationSnapshotStatus.COMPLETED
                || snapshot.aggregateDecision() == null) {
            throw new IllegalStateException("full-work moderation snapshot is still pending");
        }
        return snapshot;
    }

    public List<BookModerationSnapshot> recentSnapshots(long bookId, int limit) {
        if (bookId <= 0) {
            throw new IllegalArgumentException("book id is required");
        }
        return snapshotRepository.findByBookId(bookId, limit);
    }

    public List<Long> completedAuditIds(BookModerationSnapshot snapshot) {
        return snapshotRepository.completedAuditIds(snapshot.id());
    }

    /** Canonical whole-work version used both at snapshot creation and human-review authorization. */
    public static String currentContentVersionHash(Book book, List<Chapter> liveChapters) {
        if (book == null) {
            throw new IllegalArgumentException("book is required");
        }
        StringBuilder source = new StringBuilder("BOOK_MODERATION_SNAPSHOT_V1\n");
        appendFramed(source, "book-id", Long.toString(book.id()));
        appendFramed(source, "title", book.title());
        appendFramed(source, "category", book.category());
        appendFramed(source, "synopsis", book.synopsis());
        List<Chapter> chapters = ordered(liveChapters);
        appendFramed(source, "chapter-count", Integer.toString(chapters.size()));
        for (Chapter chapter : chapters) {
            appendFramed(source, "chapter-id", Long.toString(chapter.id()));
            appendFramed(source, "chapter-order", Integer.toString(chapter.orderNo()));
            appendFramed(source, "volume-id", chapter.volumeId() == null ? "" : chapter.volumeId().toString());
            appendFramed(source, "chapter-title", chapter.title());
            appendFramed(source, "chapter-content", chapter.content());
        }
        return ContentModerationSanitizer.sha256(source.toString());
    }

    private boolean completeClaim(BookModerationChunkClaim claim, ContentModerationAudit evaluated) {
        if (!snapshotRepository.lockActiveClaim(claim)) {
            return false;
        }
        ContentModerationAudit persisted = moderationService.persistPrepared(evaluated);
        Instant completedAt = Instant.now();
        snapshotRepository.completeLockedClaim(claim, persisted.id(), completedAt);
        if (snapshotRepository.allChunksCompleted(claim.snapshotId())) {
            List<ModerationDecision> decisions = snapshotRepository.completedDecisions(claim.snapshotId());
            ModerationDecision aggregate = aggregate(decisions);
            snapshotRepository.completeSnapshot(
                    claim.snapshotId(), aggregate, aggregateReason(aggregate), completedAt);
        }
        return true;
    }

    private SnapshotPlan buildPlan(Book book, List<Chapter> liveChapters) {
        List<Chapter> chapters = ordered(liveChapters);
        String contentVersionHash = currentContentVersionHash(book, chapters);
        long inputCharacters = snapshotInputCharacters(book, chapters);
        if (inputCharacters > properties.maxSnapshotCharacters()) {
            return boundaryPlan(contentVersionHash, inputCharacters);
        }

        List<SnapshotChunkDraft> chunks = new ArrayList<>();
        if (!appendChunks(chunks, null, book.title(), metadataContent(book))) {
            return boundaryPlan(contentVersionHash, inputCharacters);
        }
        for (Chapter chapter : chapters) {
            if (!appendChunks(
                    chunks,
                    chapter.id(),
                    book.title() + " / " + chapter.title(),
                    chapter.content())) {
                return boundaryPlan(contentVersionHash, inputCharacters);
            }
        }
        if (chunks.isEmpty() || chunks.size() > properties.maxChunks()) {
            return boundaryPlan(contentVersionHash, inputCharacters);
        }
        return new SnapshotPlan(contentVersionHash, List.copyOf(chunks), false, safeInputCharacters(inputCharacters));
    }

    private SnapshotPlan boundaryPlan(String contentVersionHash, long inputCharacters) {
        String hash = ContentModerationService.snapshotChunkContentVersionHash(BOUNDARY_CHUNK_TITLE, "");
        return new SnapshotPlan(
                contentVersionHash,
                List.of(new SnapshotChunkDraft(0, null, BOUNDARY_CHUNK_TITLE, "", hash, 0)),
                true,
                safeInputCharacters(inputCharacters));
    }

    private boolean appendChunks(List<SnapshotChunkDraft> chunks, Long sourceChapterId, String title, String content) {
        String normalizedTitle = title == null ? "" : title;
        String normalizedContent = content == null ? "" : content;
        int maximumContentCharacters = Math.min(
                properties.maxChunkCharacters(), moderationProperties.maxInputCharacters() - normalizedTitle.length());
        if (maximumContentCharacters <= 0) {
            // A title-only chunk would exceed the model bound, so the caller creates a terminal
            // boundary-failure snapshot rather than sending incomplete content to a provider.
            return false;
        }
        if (normalizedContent.isEmpty()) {
            appendChunk(chunks, sourceChapterId, normalizedTitle, "");
            return true;
        }
        int offset = 0;
        while (offset < normalizedContent.length()) {
            int end = safeChunkEnd(normalizedContent, offset, maximumContentCharacters);
            appendChunk(chunks, sourceChapterId, normalizedTitle, normalizedContent.substring(offset, end));
            offset = end;
        }
        return true;
    }

    private static int safeChunkEnd(String value, int start, int maximumCharacters) {
        int end = Math.min(value.length(), start + maximumCharacters);
        if (end < value.length()
                && end > start
                && Character.isHighSurrogate(value.charAt(end - 1))
                && Character.isLowSurrogate(value.charAt(end))) {
            end--;
        }
        return end == start ? Math.min(value.length(), start + 1) : end;
    }

    private static void appendChunk(List<SnapshotChunkDraft> chunks, Long sourceChapterId, String title, String content) {
        chunks.add(new SnapshotChunkDraft(
                chunks.size(),
                sourceChapterId,
                title,
                content,
                ContentModerationService.snapshotChunkContentVersionHash(title, content),
                title.length() + content.length()));
    }

    private static ModerationDecision aggregate(List<ModerationDecision> decisions) {
        if (decisions.isEmpty()) {
            return ModerationDecision.MANUAL_REVIEW;
        }
        boolean requiresManualReview = false;
        for (ModerationDecision decision : decisions) {
            if (decision == ModerationDecision.REJECT) {
                return ModerationDecision.REJECT;
            }
            if (decision != ModerationDecision.PASS && decision != ModerationDecision.SIMULATED_PASS) {
                requiresManualReview = true;
            }
        }
        return requiresManualReview ? ModerationDecision.MANUAL_REVIEW : ModerationDecision.PASS;
    }

    private static String aggregateReason(ModerationDecision decision) {
        return switch (decision) {
            case PASS -> "All whole-work snapshot chunks passed the automated screen; human review remains required.";
            case REJECT -> "At least one whole-work snapshot chunk was rejected by the automated screen.";
            case MANUAL_REVIEW -> "One or more whole-work snapshot chunks require human review.";
            default -> throw new IllegalArgumentException("snapshot aggregate must be PASS, MANUAL_REVIEW, or REJECT");
        };
    }

    private static long snapshotInputCharacters(Book book, List<Chapter> chapters) {
        long result = length(book.title()) + length(metadataContent(book));
        for (Chapter chapter : chapters) {
            result = Math.addExact(result, length(chapter.title()));
            result = Math.addExact(result, length(chapter.content()));
        }
        return result;
    }

    private static int safeInputCharacters(long inputCharacters) {
        return inputCharacters > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) Math.max(0, inputCharacters);
    }

    private static long length(String value) {
        return value == null ? 0L : value.length();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String metadataContent(Book book) {
        return "Category: " + nullToEmpty(book.category()) + "\n\n" + nullToEmpty(book.synopsis());
    }

    private static List<Chapter> ordered(List<Chapter> chapters) {
        if (chapters == null || chapters.isEmpty()) {
            return List.of();
        }
        return chapters.stream()
                .sorted(Comparator.comparingInt(Chapter::orderNo).thenComparingLong(Chapter::id))
                .toList();
    }

    private static void appendFramed(StringBuilder target, String field, String value) {
        String normalized = value == null ? "" : value;
        target.append(field).append(':').append(normalized.length()).append(':').append(normalized).append('\n');
    }

    private record SnapshotPlan(
            String contentVersionHash,
            List<SnapshotChunkDraft> chunks,
            boolean boundaryFailure,
            int inputCharacters) {
    }
}
