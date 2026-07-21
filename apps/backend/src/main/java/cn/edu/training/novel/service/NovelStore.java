package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NovelStore {
    private final AuditTrail auditTrail;
    private final CatalogRepository catalogRepository;
    private final WalletRepository walletRepository;
    private final ReaderRepository readerRepository;
    private final InteractionRepository interactionRepository;
    private final OperationsRepository operationsRepository;
    private final AuthService authService;
    private final ContentModerationService contentModerationService;
    private final ContentModerationReviewService contentModerationReviewService;
    private final BookModerationSnapshotService bookModerationSnapshotService;
    public NovelStore(
            AuditTrail auditTrail,
            CatalogRepository catalogRepository,
            WalletRepository walletRepository,
            ReaderRepository readerRepository,
            InteractionRepository interactionRepository,
            OperationsRepository operationsRepository,
            AuthService authService,
            ContentModerationService contentModerationService,
            ContentModerationReviewService contentModerationReviewService,
            BookModerationSnapshotService bookModerationSnapshotService) {
        this.auditTrail = auditTrail;
        this.catalogRepository = catalogRepository;
        this.walletRepository = walletRepository;
        this.readerRepository = readerRepository;
        this.interactionRepository = interactionRepository;
        this.operationsRepository = operationsRepository;
        this.authService = authService;
        this.contentModerationService = contentModerationService;
        this.contentModerationReviewService = contentModerationReviewService;
        this.bookModerationSnapshotService = bookModerationSnapshotService;
    }
    public List<Book> published(String query, String category, String status) {
        return catalogRepository.findPublished(query, category, status);
    }
    public Book book(long id) { return catalogRepository.findById(id).orElseThrow(()->new NoSuchElementException("book not found")); }
    public Book publishedBook(long id) { Book b=book(id); if (b.status()!=BookStatus.PUBLISHED) throw new NoSuchElementException("book not published"); return b; }
    public List<Chapter> publishedChapters(long id) { return catalogRepository.findPublishedChaptersByBookId(id); }
    @Transactional
    public boolean toggleShelf(long userId, long bookId) {
        ensureActive(userId);
        return readerRepository.toggleShelf(userId, bookId);
    }
    public Set<Long> shelf(long userId) { return readerRepository.shelf(userId); }
    public List<Book> shelfBooks(long userId) { return readerRepository.shelfBooks(userId); }
    @Transactional
    public int checkin(long userId) { ensureActive(userId); return readerRepository.checkin(userId); }
    public int pointBalance(long userId) { return readerRepository.pointBalance(userId); }
    @Transactional
    public Map<String,Object> redeem(long userId, String code) {
        ensureActive(userId);
        String normalizedCode = normalizeRedemptionCode(code);
        WalletRepository.RedemptionCode redemption = walletRepository.lockRedemptionCode(normalizedCode);
        walletRepository.requireRedeemable(redemption);

        // Entitlements are inserted before a wallet movement, matching the lock order used by a
        // normal purchase. The surrounding transaction rolls both back if either action fails.
        if (redemption.bookId() != null) {
            walletRepository.grantBookEntitlement(
                    userId,
                    redemption.bookId(),
                    "REDEMPTION",
                    redemption.code(),
                    0);
        }
        if (redemption.membershipDays() > 0) {
            walletRepository.grantMembershipEntitlement(
                    userId,
                    redemption.membershipDays(),
                    "REDEMPTION",
                    "REDEMPTION_CODE",
                    redemption.code());
        }
        int balance = redemption.tokenAmount() == 0
                ? walletRepository.tokenBalance(userId)
                : walletRepository.creditTokens(
                        userId,
                        redemption.tokenAmount(),
                        "REDEMPTION",
                        "REDEMPTION_CODE",
                        redemption.code());
        walletRepository.markRedeemed(redemption.code(), userId);
        audit("redeem "+redemption.code()+" user="+userId);
        return Map.of(
                "code", redemption.code(),
                "tokens", apiAmount(redemption.tokenAmount()),
                "balance", balance);
    }
    public int tokenBalance(long userId) { return walletRepository.tokenBalance(userId); }
    public ReadingPreference preference(long userId) { return readerRepository.preference(userId).orElseGet(ReadingPreference::defaults); }
    @Transactional
    public ReadingPreference savePreference(long userId, ReadingPreference preference) { ensureActive(userId); validatePreference(preference); return readerRepository.savePreference(userId, preference); }
    @Transactional
    public ReadingProgress saveProgress(long userId, long bookId, long chapterId, int offset) { ensureActive(userId); publishedBook(bookId); if (publishedChapters(bookId).stream().noneMatch(c -> c.id()==chapterId)) throw new IllegalArgumentException("chapter is not published for this book"); if (offset<0) throw new IllegalArgumentException("offset must be non-negative"); return readerRepository.saveProgress(userId, bookId, chapterId, offset); }
    public List<ReadingProgress> progress(long userId) { return readerRepository.progress(userId); }
    @Transactional
    public Bookmark bookmark(long userId,long bookId,long chapterId,int offset,String note) { ensureActive(userId); saveProgress(userId,bookId,chapterId,offset); return readerRepository.createBookmark(userId, bookId, chapterId, offset, note==null?"":note); }
    public List<Bookmark> bookmarks(long userId,long bookId) { return readerRepository.bookmarks(userId, bookId); }
    @Transactional
    public Comment comment(long userId,String userName,long bookId,Long chapterId,String content) {
        ensureActive(userId);
        publishedBook(bookId);
        validatePublishedCommentChapter(bookId, chapterId);
        String normalizedContent = requireText(content, "comment content is required");
        if (normalizedContent.length() > 4000) {
            throw new IllegalArgumentException("comment content is too long");
        }
        String status = containsSensitive(normalizedContent)
                ? InteractionRepository.PENDING_REVIEW
                : InteractionRepository.VISIBLE;
        Comment comment = interactionRepository.createComment(bookId, chapterId, userId, userName, normalizedContent, status);
        audit("comment=" + comment.id() + " book=" + bookId + " user=" + userId + " state=" + status);
        return comment;
    }
    public List<Comment> comments(long bookId) {
        publishedBook(bookId);
        return interactionRepository.findVisibleComments(bookId);
    }
    public CommentPage publicComments(long bookId, Long chapterId, int page, int size) {
        publishedBook(bookId);
        validatePublishedCommentChapter(bookId, chapterId);
        return interactionRepository.findPublicComments(bookId, chapterId, page, size);
    }
    public CommentPage userComments(long userId, String status, int page, int size) {
        return interactionRepository.findCommentsForUser(userId, status, page, size);
    }
    public CommentPage authorComments(long userId, long bookId, String status, int page, int size) {
        owned(userId, bookId);
        return interactionRepository.findCommentsForBook(bookId, status, page, size);
    }
    public CommentPage adminComments(String status, int page, int size) {
        return interactionRepository.findCommentsByStatus(status, page, size);
    }
    @Transactional
    public Comment reviewComment(long reviewerUserId, long commentId, boolean approve, String reason) {
        Comment comment = interactionRepository.reviewComment(commentId, reviewerUserId, approve, reason);
        audit("review comment=" + comment.id() + " user=" + reviewerUserId + " state=" + comment.status());
        return comment;
    }
    /**
     * Creates a reader-owned paragraph highlight only after proving that the client-submitted
     * anchor is an exact slice of a currently published chapter.  This blocks forged excerpts,
     * cross-book chapter ids, and annotations created against draft content.
     */
    @Transactional
    public ParagraphAnnotation annotateParagraph(
            long userId,
            String userName,
            long bookId,
            long chapterId,
            int paragraphIndex,
            int selectionStart,
            int selectionEnd,
            String selectedText,
            String note,
            boolean shareIntent) {
        ensureActive(userId);
        publishedBook(bookId);
        Chapter chapter = publishedAnnotationChapter(bookId, chapterId);
        String normalizedSelectedText = requireTextAtMost(selectedText, "selected text is required", 2000);
        String normalizedNote = note == null ? "" : note.trim();
        if (normalizedNote.length() > 2000) {
            throw new IllegalArgumentException("annotation note is too long");
        }
        validateParagraphAnchor(chapter, paragraphIndex, selectionStart, selectionEnd, normalizedSelectedText);
        String status = shareIntent ? InteractionRepository.PENDING_REVIEW : InteractionRepository.PRIVATE;
        ParagraphAnnotation annotation = interactionRepository.createParagraphAnnotation(
                bookId,
                chapterId,
                userId,
                userName,
                paragraphIndex,
                selectionStart,
                selectionEnd,
                normalizedSelectedText,
                normalizedNote,
                shareIntent,
                status);
        audit("paragraph annotation=" + annotation.id() + " book=" + bookId + " chapter=" + chapterId
                + " user=" + userId + " share=" + shareIntent + " state=" + status);
        return annotation;
    }
    public ParagraphAnnotationPage publicParagraphAnnotations(long bookId, long chapterId, int page, int size) {
        publishedBook(bookId);
        publishedAnnotationChapter(bookId, chapterId);
        return interactionRepository.findPublicParagraphAnnotations(bookId, chapterId, page, size);
    }
    public ParagraphAnnotationPage userParagraphAnnotations(
            long userId, Long bookId, Long chapterId, String status, int page, int size) {
        return interactionRepository.findParagraphAnnotationsForUser(userId, bookId, chapterId, status, page, size);
    }
    public ParagraphAnnotationPage authorParagraphAnnotations(
            long userId, long bookId, String status, int page, int size) {
        owned(userId, bookId);
        return interactionRepository.findParagraphAnnotationsForBook(bookId, status, page, size);
    }
    public ParagraphAnnotationPage adminParagraphAnnotations(String status, int page, int size) {
        return interactionRepository.findParagraphAnnotationsByStatus(status, page, size);
    }
    @Transactional
    public ParagraphAnnotation reviewParagraphAnnotation(
            long reviewerUserId, long annotationId, boolean approve, String reason) {
        String normalizedReason = requireTextAtMost(reason, "annotation review reason is required", 1024).trim();
        ParagraphAnnotation annotation = interactionRepository.reviewParagraphAnnotation(
                annotationId,
                reviewerUserId,
                approve,
                normalizedReason);
        audit("review paragraph annotation=" + annotation.id() + " user=" + reviewerUserId
                + " state=" + annotation.status());
        return annotation;
    }
    @Transactional
    public double rate(long userId,long bookId,int rating) {
        ensureActive(userId);
        publishedBook(bookId);
        double average = interactionRepository.rate(userId, bookId, rating);
        audit("rate book=" + bookId + " user=" + userId + " value=" + rating);
        return average;
    }
    @Transactional
    public Map<String,Object> vote(long userId,long bookId,String type) {
        ensureActive(userId);
        publishedBook(bookId);
        long count = interactionRepository.recordVote(userId, bookId, type);
        audit("vote book=" + bookId + " user=" + userId + " type=" + type);
        return Map.of("type",type,"count",count);
    }
    public InteractionStats interactionStats(long bookId) {
        publishedBook(bookId);
        return interactionRepository.stats(bookId);
    }
    @Transactional
    public Map<String,Object> reward(long userId,long bookId,int amount,String idempotencyKey) {
        ensureActive(userId);
        String key = requireIdempotencyKey(idempotencyKey);
        if(amount<=0) throw new IllegalArgumentException("amount must be positive");
        Optional<WalletRepository.RewardRecord> existing = walletRepository.findRewardRecord(userId, key);
        if (existing.isPresent()) {
            return replayReward(existing.get(), bookId, amount);
        }
        Book book = publishedBook(bookId);
        Optional<WalletRepository.RewardRecord> created =
                walletRepository.createRewardRecord(userId, book.authorId(), bookId, amount, key);
        if (created.isEmpty()) {
            // A concurrent request committed this key first. Its durable ledger is the only
            // response that may be replayed, and a changed intent remains a conflict.
            WalletRepository.RewardRecord committed = walletRepository.findRewardRecordForUpdate(userId, key)
                    .orElseThrow(() -> new IllegalStateException("reward idempotency claim was not committed"));
            return replayReward(committed, bookId, amount);
        }
        WalletRepository.RewardRecord reward = created.get();
        int balance = walletRepository.debitTokens(
                userId,
                amount,
                "BOOK_REWARD",
                "REWARD",
                Long.toString(reward.id()));
        audit("reward book="+bookId+" user="+userId+" amount="+amount);
        return Map.of("bookId",bookId,"amount",amount,"balance",balance);
    }
    @Transactional
    public Map<String,Object> purchase(long userId,long bookId) {
        ensureActive(userId);
        Book book = publishedBook(bookId);
        long price = book.purchasePrice();
        if(price<=0) throw new IllegalArgumentException("price must be positive");
        boolean granted = walletRepository.grantBookEntitlement(
                userId,
                bookId,
                "PURCHASE",
                Long.toString(bookId),
                price);
        if (!granted) {
            return Map.of("bookId",bookId,"purchased",true,"balance",walletRepository.tokenBalance(userId));
        }
        int balance = walletRepository.debitTokens(
                userId,
                price,
                "BOOK_PURCHASE",
                "BOOK",
                Long.toString(bookId));
        audit("purchase book="+bookId+" user="+userId+" price="+price);
        return Map.of("bookId",bookId,"purchased",true,"balance",balance);
    }

    /** Retains binary source compatibility without allowing a caller to determine the debit. */
    @Transactional
    public Map<String,Object> purchase(long userId,long bookId,int ignoredClientPrice) {
        return purchase(userId, bookId);
    }
    @Transactional
    public AuthorApplication applyAuthor(long userId,String penName,String statement) {
        ensureActive(userId);
        // Both this path and approval lock application rows before the profile. The profile query
        // must be a locking current read because ensureActive may already have opened a MySQL RR
        // transaction snapshot before an administrator's approval commits.
        operationsRepository.lockAuthorApplicationsForUser(userId);
        if (operationsRepository.findAuthorProfileForUpdate(userId).isPresent()) {
            throw new IllegalStateException("an approved author cannot submit another application");
        }
        AuthorApplication application = operationsRepository.createAuthorApplication(
                userId,
                requireTextAtMost(penName, "pen name is required", 128).trim(),
                requireTextAtMost(statement, "author application statement is required", 4000));
        audit("author application user=" + userId + " id=" + application.id());
        return application;
    }
    public Optional<AuthorApplication> currentAuthorApplication(long userId) {
        return operationsRepository.findLatestAuthorApplicationForUser(userId);
    }
    public List<AuthorApplication> authorApplications() { return operationsRepository.findPendingAuthorApplications(); }
    @Transactional
    public AuthorApplication decideAuthorApplication(long reviewerUserId,long id,boolean approve,String reason) {
        String normalizedReason = requireTextAtMost(reason, "author application review reason is required", 1024).trim();
        AuthorApplication application = operationsRepository.decideAuthorApplication(id, reviewerUserId, approve, normalizedReason);
        if (approve) {
            operationsRepository.createAuthorProfile(application);
            authService.grantRole(application.userId(), Role.AUTHOR);
        }
        audit("author application=" + id + " reviewer=" + reviewerUserId + " " + application.status());
        return application;
    }
    public Set<String> sensitiveWords() { return operationsRepository.sensitiveWords(); }
    @Transactional
    public void addSensitiveWord(String word) {
        String added = operationsRepository.addSensitiveWord(word);
        audit("sensitive word added word=" + added);
    }
    @Transactional
    public boolean setUserEnabled(long userId,boolean enabled) {
        boolean persisted = authService.setEnabled(userId, enabled);
        audit("user=" + userId + " enabled=" + persisted);
        return persisted;
    }
    public long activeReaders() { return operationsRepository.countEnabledReaders(); }
    public long todayReads() { return operationsRepository.countTodayReads(); }
    @Transactional
    public Book createBook(long userId, String title, String category, String synopsis) {
        Book book = catalogRepository.createBook(new Book(
                0,
                requireTextAtMost(title, "book title is required", 255).trim(),
                authorPenName(userId),
                requireTextAtMost(category, "book category is required", 128).trim(),
                0,
                "连载中",
                requireTextAtMost(synopsis, "book synopsis is required", 20000),
                "#563d7c",
                BookStatus.DRAFT,
                userId,
                0));
        audit("create book=" + book.id() + " author=" + userId);
        return book;
    }

    /** Only drafts and rejected works can have their public-facing metadata changed by an author. */
    @Transactional
    public Book updateBookMetadata(
            long userId,
            long bookId,
            String title,
            String category,
            String synopsis,
            String serialStatus,
            String cover) {
        Book book = lockedOwned(userId, bookId);
        if (!isBookMetadataEditable(book.status())) {
            throw new IllegalStateException("book metadata can only be edited while the book is a draft or rejected");
        }
        String updatedSerialStatus = serialStatus == null
                ? book.serialStatus()
                : normalizeSerialStatus(serialStatus);
        String updatedCover = cover == null
                ? book.cover()
                : requireTextAtMost(cover, "book cover is required", 1024).trim();
        Book updated = new Book(
                book.id(),
                requireTextAtMost(title, "book title is required", 255).trim(),
                book.author(),
                requireTextAtMost(category, "book category is required", 128).trim(),
                book.words(),
                updatedSerialStatus,
                requireTextAtMost(synopsis, "book synopsis is required", 20000),
                updatedCover,
                book.status(),
                book.authorId(),
                book.heat(),
                book.purchasePrice());
        catalogRepository.updateBook(updated);
        audit("update book=" + updated.id() + " author=" + userId + " state=" + updated.status());
        return updated;
    }

    /**
     * A full work is removable only before it has entered a public/review lifecycle. Child rows
     * are deleted in the same transaction after all child states and external references are
     * checked, so neither the directory nor the stored word count can be left half-updated.
     */
    @Transactional
    public void deleteBook(long userId, long bookId) {
        Book book = lockedOwned(userId, bookId);
        if (!isBookMetadataEditable(book.status())) {
            throw new IllegalStateException("only draft or rejected books can be deleted");
        }
        List<Chapter> chapters = catalogRepository.findChaptersByBookIdForUpdate(book.id());
        if (chapters.stream().anyMatch(chapter -> !isChapterSafeToDelete(chapter.status()))) {
            throw new IllegalStateException("book contains chapters that have entered publication review");
        }
        if (catalogRepository.hasExternalBookReferences(book.id())
                || chapters.stream().anyMatch(chapter -> catalogRepository.hasExternalChapterReferences(chapter.id()))) {
            throw new IllegalStateException("book has reader or transaction records and cannot be deleted");
        }
        catalogRepository.deleteBookTree(book.id());
        audit("delete book=" + book.id() + " author=" + userId + " words=" + book.words());
    }

    public List<Volume> authorVolumes(long userId, long bookId) {
        owned(userId, bookId);
        return catalogRepository.findVolumesByBookId(bookId);
    }

    @Transactional
    public Volume createVolume(long userId, long bookId, String title) {
        Book book = lockedOwned(userId, bookId);
        String normalizedTitle = requireText(title, "volume title is required");
        Volume volume = catalogRepository.createVolume(book.id(), normalizedTitle, catalogRepository.nextVolumeOrder(book.id()));
        audit("create volume=" + volume.id() + " book=" + book.id());
        return volume;
    }

    public List<Chapter> authorChapters(long userId, long bookId) {
        owned(userId, bookId);
        return catalogRepository.findChaptersByBookId(bookId);
    }

    /**
     * Drafts and scheduled chapters are edited in place. A change to a published chapter is never
     * directly visible: it is moved out of the public read model and the complete work is queued
     * for review after the local automatic screen.
     */
    @Transactional
    public Chapter updateChapter(
            long userId,
            long bookId,
            long chapterId,
            String title,
            String content,
            Long volumeId) {
        Book book = lockedOwned(userId, bookId);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        String normalizedTitle = requireTextAtMost(title, "chapter title is required", 255).trim();
        String normalizedContent = requireTextAtMost(content, "chapter content is required", 20000);
        Long targetVolumeId;
        if (volumeId == null) {
            targetVolumeId = chapter.volumeId();
        } else {
            targetVolumeId = lockedVolumeForBook(book, volumeId).id();
        }
        int words = updatedWordCount(book.words(), chapter.content(), normalizedContent);

        if (chapter.status() == ChapterStatus.DRAFT || chapter.status() == ChapterStatus.SCHEDULED) {
            Chapter updated = new Chapter(
                    chapter.id(),
                    chapter.bookId(),
                    targetVolumeId,
                    normalizedTitle,
                    normalizedContent,
                    false,
                    chapter.status(),
                    chapter.scheduledPublishAt(),
                    null,
                    "",
                    chapter.orderNo());
            catalogRepository.updateChapter(updated);
            Book updatedBook = copyBook(book, words, book.status());
            catalogRepository.updateBook(updatedBook);
            if (awaitingFullWorkReview(updatedBook.status())) {
                queueWholeWorkSnapshot(updatedBook);
            }
            audit("update chapter=" + updated.id() + " author=" + userId + " state=" + updated.status());
            return updated;
        }

        if (chapter.status() != ChapterStatus.PUBLISHED) {
            throw new IllegalStateException("only draft, scheduled, or published chapters can be edited");
        }

        ContentModerationAudit moderation = contentModerationService.moderateChapter(
                chapter.id(), normalizedTitle, normalizedContent, ModerationTrigger.PUBLISHED_CHAPTER_REVISION);
        boolean localSensitiveHit = moderation.decision() == ModerationDecision.LOCAL_SENSITIVE_WORD;
        Chapter queuedRevision = new Chapter(
                chapter.id(),
                chapter.bookId(),
                targetVolumeId,
                normalizedTitle,
                normalizedContent,
                false,
                ChapterStatus.NEEDS_REVIEW,
                null,
                null,
                localSensitiveHit
                        ? "命中本地敏感词，已暂停已发布章节修改并标记整书复核"
                        : chapterRevisionReviewReason(moderation),
                chapter.orderNo());
        catalogRepository.updateChapter(queuedRevision);
        Book queuedBook = copyBook(book, words, BookStatus.NEEDS_REVIEW);
        catalogRepository.updateBook(queuedBook);
        queueWholeWorkSnapshot(queuedBook);
        audit("update published chapter=" + queuedRevision.id() + " author=" + userId
                + " screened=" + (localSensitiveHit ? "blocked" : moderation.decision().name()) + " book=" + book.id());
        return queuedRevision;
    }

    @Transactional
    public void deleteChapter(long userId, long bookId, long chapterId) {
        Book book = lockedOwned(userId, bookId);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        if (!isChapterSafeToDelete(chapter.status())) {
            throw new IllegalStateException("only draft or scheduled chapters can be deleted");
        }
        if (catalogRepository.hasExternalChapterReferences(chapter.id())) {
            throw new IllegalStateException("chapter has reader records and cannot be deleted");
        }
        catalogRepository.deleteChapter(chapter.id());
        Book updatedBook = copyBook(book, updatedWordCount(book.words(), chapter.content(), ""), book.status());
        catalogRepository.updateBook(updatedBook);
        if (awaitingFullWorkReview(updatedBook.status())) {
            queueWholeWorkSnapshot(updatedBook);
        }
        audit("delete chapter=" + chapter.id() + " author=" + userId + " book=" + book.id());
    }

    @Transactional
    public Chapter createDraftChapter(long userId, long bookId, long volumeId, String title, String content) {
        return addChapter(userId, bookId, volumeId, title, content, false);
    }

    @Transactional
    public Chapter addChapter(long userId,long bookId,String title,String content,boolean submit) {
        return addChapter(userId, bookId, null, title, content, submit);
    }

    /**
     * A submitted row is inserted as a draft first so the moderation evidence always has a stable
     * chapter id and version hash. A chapter may be released after a passing automatic screen, but
     * the automatic decision can never publish its parent work.
     */
    @Transactional
    public Chapter addChapter(long userId, long bookId, Long volumeId, String title, String content, boolean submit) {
        Book book = lockedOwned(userId, bookId);
        String normalizedTitle = requireTextAtMost(title, "chapter title is required", 255).trim();
        String normalizedContent = requireTextAtMost(content, "chapter content is required", 20000);
        if (volumeId != null) {
            lockedVolumeForBook(book, volumeId);
        }

        Chapter draft = catalogRepository.createChapter(new Chapter(
                0,
                bookId,
                volumeId,
                normalizedTitle,
                normalizedContent,
                false,
                ChapterStatus.DRAFT,
                null,
                null,
                "",
                catalogRepository.nextChapterOrder(bookId)));
        if (!submit) {
            Book updatedBook = copyBook(book, addWords(book.words(), normalizedContent.length()), book.status());
            catalogRepository.updateBook(updatedBook);
            if (awaitingFullWorkReview(updatedBook.status())) {
                queueWholeWorkSnapshot(updatedBook);
            }
            audit("chapter=" + draft.id() + " state=" + ChapterStatus.DRAFT);
            return draft;
        }

        ContentModerationAudit moderation = contentModerationService.moderateChapter(
                draft.id(), normalizedTitle, normalizedContent, ModerationTrigger.CHAPTER_SUBMISSION);
        boolean mayPublishChapter = moderation.decision().permitsAutomaticChapterPublication();
        ChapterStatus chapterStatus = mayPublishChapter ? ChapterStatus.PUBLISHED : ChapterStatus.NEEDS_REVIEW;
        BookStatus bookStatus = nextBookStatusForChapterSubmission(book.status(), true, !mayPublishChapter);
        Chapter submitted = new Chapter(
                draft.id(),
                draft.bookId(),
                draft.volumeId(),
                draft.title(),
                draft.content(),
                mayPublishChapter,
                chapterStatus,
                null,
                mayPublishChapter ? Instant.now() : null,
                chapterSubmissionReviewReason(moderation),
                draft.orderNo());
        Chapter persisted = catalogRepository.updateChapter(submitted);
        Book submittedBook = copyBook(book, addWords(book.words(), normalizedContent.length()), bookStatus);
        catalogRepository.updateBook(submittedBook);
        queueWholeWorkSnapshot(submittedBook);
        audit("chapter=" + persisted.id() + " state=" + chapterStatus + " moderation=" + moderation.decision());
        return persisted;
    }

    /** Submits an existing draft after it has been edited or returned by a reviewer. */
    @Transactional
    public Chapter submitChapter(long userId, long bookId, long chapterId) {
        Book book = lockedOwned(userId, bookId);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        if (chapter.status() != ChapterStatus.DRAFT) {
            throw new IllegalStateException("only draft chapters can be submitted");
        }
        ContentModerationAudit moderation = contentModerationService.moderateChapter(
                chapter.id(), chapter.title(), chapter.content(), ModerationTrigger.CHAPTER_SUBMISSION);
        boolean mayPublishChapter = moderation.decision().permitsAutomaticChapterPublication();
        ChapterStatus chapterStatus = mayPublishChapter ? ChapterStatus.PUBLISHED : ChapterStatus.NEEDS_REVIEW;
        BookStatus bookStatus = nextBookStatusForChapterSubmission(book.status(), true, !mayPublishChapter);
        Chapter submitted = new Chapter(
                chapter.id(),
                chapter.bookId(),
                chapter.volumeId(),
                chapter.title(),
                chapter.content(),
                mayPublishChapter,
                chapterStatus,
                null,
                mayPublishChapter ? Instant.now() : null,
                chapterSubmissionReviewReason(moderation),
                chapter.orderNo());
        Chapter persisted = catalogRepository.updateChapter(submitted);
        Book submittedBook = copyBook(book, book.words(), bookStatus);
        catalogRepository.updateBook(submittedBook);
        queueWholeWorkSnapshot(submittedBook);
        audit("submit chapter=" + persisted.id() + " author=" + userId + " state=" + chapterStatus
                + " moderation=" + moderation.decision());
        return persisted;
    }

    @Transactional
    public Chapter scheduleChapter(long userId, long bookId, long chapterId, Instant scheduledPublishAt) {
        if (scheduledPublishAt == null || !scheduledPublishAt.isAfter(Instant.now())) {
            throw new IllegalArgumentException("scheduled publication time must be in the future");
        }
        Book book = lockedOwned(userId, bookId);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        if (chapter.status() != ChapterStatus.DRAFT) {
            throw new IllegalStateException("only draft chapters can be scheduled");
        }
        Chapter scheduled = new Chapter(
                chapter.id(),
                chapter.bookId(),
                chapter.volumeId(),
                chapter.title(),
                chapter.content(),
                false,
                ChapterStatus.SCHEDULED,
                scheduledPublishAt,
                null,
                "",
                chapter.orderNo());
        catalogRepository.updateChapter(scheduled);
        audit("chapter=" + scheduled.id() + " scheduled=" + scheduledPublishAt);
        return scheduled;
    }

    /**
     * Publishes due chapters only after the same local-first, bounded automatic screen used by a
     * direct submission. Every non-pass (including model unavailability) holds the complete work
     * for the administrator's review.
     */
    @Transactional
    public DuePublicationResult publishDueChapters(long userId, Instant dueAt) {
        requireDueTime(dueAt);
        return publishDueCandidates(
                catalogRepository.findDueScheduledChaptersByAuthorId(userId, dueAt),
                dueAt,
                userId);
    }

    /**
     * Trusted scheduler entry point. It deliberately has no browser/API route and processes every
     * due row using the same sensitive-word and complete-book review transition as an author run.
     */
    @Transactional
    public DuePublicationResult publishAllDueChapters(Instant dueAt) {
        requireDueTime(dueAt);
        return publishDueCandidates(catalogRepository.findDueScheduledChapters(dueAt), dueAt, null);
    }

    private DuePublicationResult publishDueCandidates(
            List<Chapter> candidates,
            Instant dueAt,
            Long expectedAuthorId) {
        List<Chapter> published = new ArrayList<>();
        List<Chapter> needsReview = new ArrayList<>();
        for (Chapter candidate : candidates) {
            // Always take the parent first, then the chapter, matching scheduleChapter's lock order.
            Book book;
            try {
                book = lockedBook(candidate.bookId());
            } catch (NoSuchElementException ignored) {
                // A draft book can be removed after this candidate query but before its lock.
                // Skipping it keeps the rest of this scheduler batch transactional and idempotent.
                continue;
            }
            if (expectedAuthorId != null && book.authorId() != expectedAuthorId) {
                continue;
            }
            Chapter chapter;
            try {
                chapter = lockedChapterForBook(book, candidate.id());
            } catch (NoSuchElementException ignored) {
                continue;
            }
            if (chapter.status() != ChapterStatus.SCHEDULED
                    || chapter.scheduledPublishAt() == null
                    || chapter.scheduledPublishAt().isAfter(dueAt)) {
                continue;
            }

            ContentModerationAudit moderation = contentModerationService.moderateChapter(
                    chapter.id(), chapter.title(), chapter.content(), ModerationTrigger.SCHEDULED_PUBLICATION);
            if (!moderation.decision().permitsAutomaticChapterPublication()) {
                Chapter held = new Chapter(
                        chapter.id(),
                        chapter.bookId(),
                        chapter.volumeId(),
                        chapter.title(),
                        chapter.content(),
                        false,
                        ChapterStatus.NEEDS_REVIEW,
                        null,
                        null,
                        scheduledPublicationReviewReason(moderation),
                        chapter.orderNo());
                catalogRepository.updateChapter(held);
                Book heldBook = copyBook(book, book.words(), BookStatus.NEEDS_REVIEW);
                catalogRepository.updateBook(heldBook);
                queueWholeWorkSnapshot(heldBook);
                audit("scheduled chapter=" + held.id() + " blocked="
                        + (moderation.decision() == ModerationDecision.LOCAL_SENSITIVE_WORD
                                ? "sensitive-word"
                                : moderation.decision()));
                needsReview.add(held);
                continue;
            }

            Chapter released = new Chapter(
                    chapter.id(),
                    chapter.bookId(),
                    chapter.volumeId(),
                    chapter.title(),
                    chapter.content(),
                    true,
                    ChapterStatus.PUBLISHED,
                    null,
                    dueAt,
                    "",
                    chapter.orderNo());
            catalogRepository.updateChapter(released);
            audit("scheduled chapter=" + released.id() + " published");
            published.add(released);
        }
        return new DuePublicationResult(published.size() + needsReview.size(), List.copyOf(published), List.copyOf(needsReview));
    }
    @Transactional
    public Book submitBook(long userId,long bookId) {
        Book book = lockedOwned(userId, bookId);
        Book updated = copyBook(book, book.words(), BookStatus.PENDING_REVIEW);
        catalogRepository.updateBook(updated);
        queueWholeWorkSnapshot(updated);
        audit("submit book=" + updated.id() + " author=" + userId);
        return updated;
    }

    @Transactional
    public Book review(long reviewerUserId, long id, boolean approve, String reason) {
        if (reviewerUserId <= 0) {
            throw new IllegalArgumentException("reviewer user id is required");
        }
        Book book = lockedBook(id);
        if (book.status() != BookStatus.PENDING_REVIEW && book.status() != BookStatus.NEEDS_REVIEW) {
            throw new IllegalStateException("book is not awaiting a full-work human review");
        }
        String normalizedReason = requireTextAtMost(reason, "review reason is required", 900);
        List<Chapter> chapters = catalogRepository.findChaptersByBookIdForUpdate(book.id());
        BookModerationSnapshot snapshot = bookModerationSnapshotService.requireCurrentTerminalSnapshot(book, chapters);
        contentModerationReviewService.recordCurrentBookEvidence(
                book.id(),
                reviewerUserId,
                approve,
                normalizedReason,
                chapters,
                bookModerationSnapshotService.completedAuditIds(snapshot));
        for (Chapter chapter : chapters) {
            if (chapter.status() != ChapterStatus.NEEDS_REVIEW) {
                continue;
            }
            Chapter reviewed = approve
                    ? new Chapter(
                            chapter.id(),
                            chapter.bookId(),
                            chapter.volumeId(),
                            chapter.title(),
                            chapter.content(),
                            true,
                            ChapterStatus.PUBLISHED,
                            null,
                            Instant.now(),
                            "",
                            chapter.orderNo())
                    : new Chapter(
                            chapter.id(),
                            chapter.bookId(),
                            chapter.volumeId(),
                            chapter.title(),
                            chapter.content(),
                            false,
                            ChapterStatus.DRAFT,
                            null,
                            null,
                            "整书审核驳回：" + normalizedReason,
                            chapter.orderNo());
            catalogRepository.updateChapter(reviewed);
        }
        Book updated = copyBook(book, book.words(), approve ? BookStatus.PUBLISHED : BookStatus.REJECTED);
        catalogRepository.updateBook(updated);
        audit("review book=" + id + " reviewer=" + reviewerUserId + " " + updated.status()
                + " reason=" + normalizedReason);
        return updated;
    }
    public List<Book> authorBooks(long userId) { return catalogRepository.findByAuthorId(userId); }
    public List<Book> pending() { return catalogRepository.findPendingReview(); }
    public List<String> audits() { return auditTrail.recent(); }
    public List<ContentModerationAudit> moderationAudits(String contentType, int limit) {
        return contentModerationService.recentAudits(contentType, limit);
    }
    public List<ContentModerationReview> moderationReviews(long bookId, int limit) {
        return contentModerationReviewService.recentReviews(bookId, limit);
    }
    public List<BookModerationSnapshot> moderationSnapshots(long bookId, int limit) {
        return bookModerationSnapshotService.recentSnapshots(bookId, limit);
    }
    private Book owned(long userId,long bookId) { Book b=book(bookId); if(b.authorId()!=userId) throw new SecurityException("resource does not belong to current author"); return b; }
    private Book lockedOwned(long userId,long bookId) { Book b=lockedBook(bookId); if(b.authorId()!=userId) throw new SecurityException("resource does not belong to current author"); return b; }
    private Book lockedBook(long bookId) { return catalogRepository.findByIdForUpdate(bookId).orElseThrow(()->new NoSuchElementException("book not found")); }
    private Volume lockedVolumeForBook(Book book, long volumeId) {
        Volume volume = catalogRepository.findVolumeByIdForUpdate(volumeId)
                .orElseThrow(() -> new NoSuchElementException("volume not found"));
        if (volume.bookId() != book.id()) {
            throw new SecurityException("volume does not belong to current book");
        }
        return volume;
    }
    private Chapter lockedChapterForBook(Book book, long chapterId) {
        Chapter chapter = catalogRepository.findChapterByIdForUpdate(chapterId)
                .orElseThrow(() -> new NoSuchElementException("chapter not found"));
        if (chapter.bookId() != book.id()) {
            throw new SecurityException("chapter does not belong to current book");
        }
        return chapter;
    }
    /** Caller holds the book lock; acquiring all chapter locks makes the copied version atomic. */
    private void queueWholeWorkSnapshot(Book book) {
        bookModerationSnapshotService.queueCurrentSnapshot(
                book,
                catalogRepository.findChaptersByBookIdForUpdate(book.id()));
    }
    private static boolean awaitingFullWorkReview(BookStatus status) {
        return status == BookStatus.PENDING_REVIEW || status == BookStatus.NEEDS_REVIEW;
    }
    /** A model result may release a chapter, but only a human review can set a book to PUBLISHED. */
    private static BookStatus nextBookStatusForChapterSubmission(
            BookStatus current, boolean submit, boolean requiresHumanReview) {
        if (!submit) return current;
        if (requiresHumanReview) return BookStatus.NEEDS_REVIEW;
        return current == BookStatus.DRAFT || current == BookStatus.REJECTED
                ? BookStatus.PENDING_REVIEW
                : current;
    }
    private static Book copyBook(Book book, int words, BookStatus status) {
        return new Book(
                book.id(),
                book.title(),
                book.author(),
                book.category(),
                words,
                book.serialStatus(),
                book.synopsis(),
                book.cover(),
                status,
                book.authorId(),
                book.heat(),
                book.purchasePrice());
    }
    private static boolean isBookMetadataEditable(BookStatus status) {
        return status == BookStatus.DRAFT || status == BookStatus.REJECTED;
    }
    private static boolean isChapterSafeToDelete(ChapterStatus status) {
        return status == ChapterStatus.DRAFT || status == ChapterStatus.SCHEDULED;
    }
    private static int addWords(int existingWords, int additionalWords) {
        long result = (long) existingWords + additionalWords;
        if (result < 0 || result > Integer.MAX_VALUE) {
            throw new IllegalStateException("book word count is out of range");
        }
        return (int) result;
    }
    private static int updatedWordCount(int existingWords, String replacedContent, String replacementContent) {
        long result = (long) existingWords - replacedContent.length() + replacementContent.length();
        if (result < 0 || result > Integer.MAX_VALUE) {
            throw new IllegalStateException("book word count is out of range");
        }
        return (int) result;
    }
    private static String normalizeSerialStatus(String serialStatus) {
        String normalized = requireTextAtMost(serialStatus, "book serial status is required", 32).trim();
        if (!Set.of("连载中", "已完结").contains(normalized)) {
            throw new IllegalArgumentException("unsupported book serial status");
        }
        return normalized;
    }
    private void validatePublishedCommentChapter(long bookId, Long chapterId) {
        if (chapterId != null && publishedChapters(bookId).stream().noneMatch(chapter -> chapter.id() == chapterId.longValue())) {
            throw new IllegalArgumentException("chapter is not published for this book");
        }
    }
    private Chapter publishedAnnotationChapter(long bookId, long chapterId) {
        Chapter chapter = catalogRepository.findChapterById(chapterId)
                .orElseThrow(() -> new NoSuchElementException("chapter not found"));
        if (chapter.bookId() != bookId
                || !chapter.published()
                || chapter.status() != ChapterStatus.PUBLISHED) {
            throw new IllegalArgumentException("chapter is not published for this book");
        }
        return chapter;
    }
    private static void validateParagraphAnchor(
            Chapter chapter,
            int paragraphIndex,
            int selectionStart,
            int selectionEnd,
            String selectedText) {
        if (paragraphIndex < 0) {
            throw new IllegalArgumentException("paragraph index must be non-negative");
        }
        List<String> paragraphs = chapterParagraphs(chapter.content());
        if (paragraphIndex >= paragraphs.size()) {
            throw new IllegalArgumentException("paragraph index is outside the chapter");
        }
        if (selectionStart < 0 || selectionEnd <= selectionStart) {
            throw new IllegalArgumentException("annotation selection range is invalid");
        }
        String paragraph = paragraphs.get(paragraphIndex);
        if (selectionEnd > paragraph.length()) {
            throw new IllegalArgumentException("annotation selection exceeds the paragraph");
        }
        if (!paragraph.substring(selectionStart, selectionEnd).equals(selectedText)) {
            throw new IllegalArgumentException("annotation selected text does not match the chapter");
        }
    }
    private static List<String> chapterParagraphs(String content) {
        String normalized = content == null ? "" : content.replace("\r\n", "\n").replace('\r', '\n');
        return Arrays.stream(normalized.split("\n", -1))
                .filter(paragraph -> !paragraph.isEmpty())
                .toList();
    }
    private static String requireText(String value, String message) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(message);
        return value;
    }
    private static String requireTextAtMost(String value, String message, int maximumLength) {
        String required = requireText(value, message);
        if (required.length() > maximumLength) throw new IllegalArgumentException(message + " is too long");
        return required;
    }
    private static void requireDueTime(Instant dueAt) {
        if (dueAt == null) throw new IllegalArgumentException("due time is required");
    }
    private static String chapterSubmissionReviewReason(ContentModerationAudit moderation) {
        return switch (moderation.decision()) {
            case PASS, SIMULATED_PASS -> "";
            case LOCAL_SENSITIVE_WORD -> "命中本地敏感词，已暂停章节发布";
            case MANUAL_REVIEW, REJECT -> "模型审核建议人工复核，已暂停章节发布并标记整书复核";
            case MODEL_UNAVAILABLE, MODEL_ERROR, INVALID_OUTPUT -> "模型审核不可用或结果无效，已暂停章节发布并标记整书复核";
        };
    }
    private static String scheduledPublicationReviewReason(ContentModerationAudit moderation) {
        if (moderation.decision() == ModerationDecision.LOCAL_SENSITIVE_WORD) {
            return "命中本地敏感词，已暂停定时发布";
        }
        return switch (moderation.decision()) {
            case MANUAL_REVIEW, REJECT -> "模型审核建议人工复核，已暂停定时发布并标记整书复核";
            case MODEL_UNAVAILABLE, MODEL_ERROR, INVALID_OUTPUT -> "模型审核不可用或结果无效，已暂停定时发布并标记整书复核";
            case PASS, SIMULATED_PASS -> "";
            case LOCAL_SENSITIVE_WORD -> throw new IllegalStateException("local moderation decision already handled");
        };
    }
    private static String chapterRevisionReviewReason(ContentModerationAudit moderation) {
        return switch (moderation.decision()) {
            case PASS, SIMULATED_PASS -> "已修改已发布章节，等待整书复核";
            case LOCAL_SENSITIVE_WORD -> "命中本地敏感词，已暂停已发布章节修改并标记整书复核";
            case MANUAL_REVIEW, REJECT -> "模型审核建议人工复核，已暂停已发布章节修改并标记整书复核";
            case MODEL_UNAVAILABLE, MODEL_ERROR, INVALID_OUTPUT -> "模型审核不可用或结果无效，已暂停已发布章节修改并标记整书复核";
        };
    }
    private String authorPenName(long userId) {
        return operationsRepository.findAuthorProfile(userId)
                .map(AuthorProfile::penName)
                // Existing local fixtures predate author applications. Their persisted catalog
                // record keeps the development author workflow usable without a code-level name.
                .or(() -> catalogRepository.findByAuthorId(userId).stream().map(Book::author).findFirst())
                .orElseThrow(() -> new IllegalStateException("approved author profile is required to create a book"));
    }
    private boolean containsSensitive(String value) { return operationsRepository.containsSensitiveWord(value); }
    private void audit(String action) { auditTrail.record(action); }
    private void ensureActive(long userId) { authService.requireEnabled(userId); }
    private static String normalizeRedemptionCode(String code) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("兑换码不能为空");
        return code.trim().toUpperCase(Locale.ROOT);
    }
    private Map<String,Object> replayReward(WalletRepository.RewardRecord reward, long bookId, int amount) {
        if (reward.bookId() != bookId || reward.amount() != amount) {
            throw new IllegalStateException("idempotency key was already used for a different reward");
        }
        int originalBalance = walletRepository.rewardBalanceAfter(reward)
                .orElseThrow(() -> new IllegalStateException("completed reward is missing its ledger debit"));
        return Map.of("bookId", reward.bookId(), "amount", apiAmount(reward.amount()), "balance", originalBalance);
    }
    private static String requireIdempotencyKey(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Idempotency-Key is required");
        }
        if (value.length() > 128) {
            throw new IllegalArgumentException("Idempotency-Key must be at most 128 characters");
        }
        return value;
    }
    private static int apiAmount(long amount) {
        try { return Math.toIntExact(amount); }
        catch (ArithmeticException exception) { throw new IllegalStateException("兑换金额超出 API 范围", exception); }
    }
    private static void validatePreference(ReadingPreference value) { if(value.fontSize()<14||value.fontSize()>32||value.lineHeight()<120||value.lineHeight()>260||value.brightness()<10||value.brightness()>100) throw new IllegalArgumentException("reading preference is out of range"); if(!Set.of("paper","night","sepia").contains(value.theme())||!Set.of("slide","cover","simulation").contains(value.pageMode())) throw new IllegalArgumentException("unsupported reader setting"); }
}
