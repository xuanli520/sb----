package cn.edu.training.novel.service;

import cn.edu.training.novel.config.AuthorApplicationPolicyProperties;
import cn.edu.training.novel.domain.*;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NovelStore {
    private final AuditTrail auditTrail;
    private final CatalogRepository catalogRepository;
    private final WalletRepository walletRepository;
    private final CommercialRuleService commercialRuleService;
    private final ReaderRepository readerRepository;
    private final InteractionRepository interactionRepository;
    private final OperationsRepository operationsRepository;
    private final AuthService authService;
    private final ContentModerationService contentModerationService;
    private final ContentModerationReviewService contentModerationReviewService;
    private final BookModerationSnapshotService bookModerationSnapshotService;
    private final AuthorApplicationPolicyProperties authorApplicationPolicy;
    private final HomeCarouselService homeCarouselService;
    private final BookPageService bookPageService;

    /** Test/repository recreation constructor with the documented default policy. */
    public NovelStore(
            AuditTrail auditTrail,
            CatalogRepository catalogRepository,
            WalletRepository walletRepository,
            CommercialRuleService commercialRuleService,
            ReaderRepository readerRepository,
            InteractionRepository interactionRepository,
            OperationsRepository operationsRepository,
            AuthService authService,
            ContentModerationService contentModerationService,
            ContentModerationReviewService contentModerationReviewService,
            BookModerationSnapshotService bookModerationSnapshotService,
            BookPageService bookPageService) {
        this(
                auditTrail,
                catalogRepository,
                walletRepository,
                commercialRuleService,
                readerRepository,
                interactionRepository,
                operationsRepository,
                authService,
                contentModerationService,
                contentModerationReviewService,
                bookModerationSnapshotService,
                new AuthorApplicationPolicyProperties(Duration.ofDays(7)),
                null,
                bookPageService);
    }

    @Autowired
    public NovelStore(
            AuditTrail auditTrail,
            CatalogRepository catalogRepository,
            WalletRepository walletRepository,
            CommercialRuleService commercialRuleService,
            ReaderRepository readerRepository,
            InteractionRepository interactionRepository,
            OperationsRepository operationsRepository,
            AuthService authService,
            ContentModerationService contentModerationService,
            ContentModerationReviewService contentModerationReviewService,
            BookModerationSnapshotService bookModerationSnapshotService,
            AuthorApplicationPolicyProperties authorApplicationPolicy,
            HomeCarouselService homeCarouselService,
            BookPageService bookPageService) {
        this.auditTrail = auditTrail;
        this.catalogRepository = catalogRepository;
        this.walletRepository = walletRepository;
        this.commercialRuleService = commercialRuleService;
        this.readerRepository = readerRepository;
        this.interactionRepository = interactionRepository;
        this.operationsRepository = operationsRepository;
        this.authService = authService;
        this.contentModerationService = contentModerationService;
        this.contentModerationReviewService = contentModerationReviewService;
        this.bookModerationSnapshotService = bookModerationSnapshotService;
        this.authorApplicationPolicy = authorApplicationPolicy;
        this.homeCarouselService = homeCarouselService;
        this.bookPageService = Objects.requireNonNull(bookPageService, "bookPageService");
    }
    public List<Book> published(String query, String category, String status) {
        return catalogRepository.findPublished(query, category, status);
    }
    public Book book(long id) { return catalogRepository.findById(id).orElseThrow(()->new NoSuchElementException("book not found")); }
    public Book publishedBook(long id) { Book b=book(id); if (b.status()!=BookStatus.PUBLISHED) throw new NoSuchElementException("book not published"); return b; }
    public List<Chapter> publishedChapters(long id) { return catalogRepository.findPublishedChaptersByBookId(id); }

    /** Anonymous readers receive only the first currently published chapter as a preview. */
    public ReaderBookDetail publicReaderBook(long bookId) {
        return readerBook(null, bookId);
    }

    /**
     * Builds the only reader-content projection which can contain a later chapter's body.  Catalog
     * metadata remains visible for locked chapters, but their content is never serialised to an
     * unentitled account.
     */
    public ReaderBookDetail readerBook(CurrentUser actor, long bookId) {
        if (actor != null) ensureActive(actor.id());
        Book book = publishedBook(bookId);
        String fullAccessSource = fullBookAccessSource(actor, book);
        List<Chapter> chapters = publishedChapters(bookId);
        List<ReaderChapter> readerChapters = new ArrayList<>(chapters.size());
        for (int index = 0; index < chapters.size(); index++) {
            Chapter chapter = chapters.get(index);
            boolean preview = index == 0;
            boolean readable = fullAccessSource != null || preview;
            readerChapters.add(new ReaderChapter(
                    chapter.id(),
                    chapter.bookId(),
                    chapter.volumeId(),
                    chapter.title(),
                    readable ? chapter.content() : null,
                    chapter.published(),
                    chapter.status(),
                    chapter.scheduledPublishAt(),
                    chapter.publishedAt(),
                    chapter.reviewReason(),
                    chapter.orderNo(),
                    readable,
                    readable ? (fullAccessSource == null ? "PREVIEW" : fullAccessSource) : "ENTITLEMENT_REQUIRED"));
        }
        Set<Long> readableChapterIds = readerChapters.stream()
                .filter(ReaderChapter::readable)
                .map(ReaderChapter::id)
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
        List<Comment> visibleComments = comments(bookId).stream()
                .filter(comment -> comment.chapterId() == null || readableChapterIds.contains(comment.chapterId()))
                .toList();
        return new ReaderBookDetail(
                book,
                readerChapters,
                visibleComments,
                new ReaderBookAccess(fullAccessSource != null, fullAccessSource == null ? "PREVIEW" : fullAccessSource),
                actor == null ? null : interactionRepository.ratingForUser(actor.id(), bookId));
    }
    @Transactional
    public boolean toggleShelf(long userId, long bookId) {
        ensureActive(userId);
        return readerRepository.toggleShelf(userId, bookId);
    }
    public Set<Long> shelf(long userId) { return readerRepository.shelf(userId); }
    public BookPresentationPage shelfBooks(long userId, int page, int size) {
        return bookPages().bookshelf(userId, page, size);
    }
    public boolean bookshelfContains(long userId, long bookId) {
        ensureActive(userId);
        return bookPages().bookshelfContains(userId, bookId);
    }
    @Transactional
    public BookSubscription subscribe(long userId, long bookId) {
        ensureActive(userId);
        // Following is allowed only while a work is publicly discoverable. It grants no reading
        // entitlement and remains independent of membership and purchase state.
        publishedBook(bookId);
        return readerRepository.subscribe(userId, bookId);
    }
    @Transactional
    public BookSubscription unsubscribe(long userId, long bookId) {
        ensureActive(userId);
        return readerRepository.unsubscribe(userId, bookId);
    }
    public List<BookSubscription> subscriptions(long userId) {
        ensureActive(userId);
        return readerRepository.subscriptions(userId);
    }
    public BookSubscription subscription(long userId, long bookId) {
        ensureActive(userId);
        return readerRepository.subscription(userId, bookId);
    }
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
    public CommercialRules commercialRules(long userId) { ensureActive(userId); return commercialRuleService.current(); }
    public ReadingPreference preference(long userId) { return readerRepository.preference(userId).orElseGet(ReadingPreference::defaults); }
    @Transactional
    public ReadingPreference savePreference(long userId, ReadingPreference preference) { ensureActive(userId); validatePreference(preference); return readerRepository.savePreference(userId, preference); }
    @Transactional
    public ReadingProgress saveProgress(long userId, long bookId, long chapterId, int offset) {
        return saveProgress(readerActor(userId), bookId, chapterId, offset);
    }
    @Transactional
    public ReadingProgress saveProgress(CurrentUser actor, long bookId, long chapterId, int offset) {
        ensureActive(actor.id());
        requireReadablePublishedChapter(actor, bookId, chapterId);
        if (offset < 0) throw new IllegalArgumentException("offset must be non-negative");
        return readerRepository.saveProgress(actor.id(), bookId, chapterId, offset);
    }
    public List<ReadingProgress> progress(long userId) { return readerRepository.progress(userId); }
    public ReadingProgress progressForBook(long userId, long bookId) {
        ensureActive(userId);
        if (bookId <= 0) throw new IllegalArgumentException("book id is required");
        return readerRepository.progressForBook(userId, bookId).orElse(null);
    }
    @Transactional
    public Bookmark bookmark(long userId,long bookId,long chapterId,int offset,String note) {
        return bookmark(readerActor(userId), bookId, chapterId, offset, note);
    }
    @Transactional
    public Bookmark bookmark(CurrentUser actor,long bookId,long chapterId,int offset,String note) {
        saveProgress(actor, bookId, chapterId, offset);
        return readerRepository.createBookmark(actor.id(), bookId, chapterId, offset, note == null ? "" : note);
    }
    public List<Bookmark> bookmarks(long userId,long bookId) { return readerRepository.bookmarks(userId, bookId); }
    @Transactional
    public Comment comment(long userId,String userName,long bookId,Long chapterId,String content) {
        return comment(new CurrentUser(userId, userName, Set.of(Role.READER), false), bookId, chapterId, content);
    }
    @Transactional
    public Comment comment(CurrentUser actor,long bookId,Long chapterId,String content) {
        ensureActive(actor.id());
        publishedBook(bookId);
        validatePublishedCommentChapter(bookId, chapterId);
        if (chapterId != null) requireReadablePublishedChapter(actor, bookId, chapterId);
        String normalizedContent = requireText(content, "comment content is required");
        if (normalizedContent.length() > 4000) {
            throw new IllegalArgumentException("comment content is too long");
        }
        String status = containsSensitive(normalizedContent)
                ? InteractionRepository.PENDING_REVIEW
                : InteractionRepository.VISIBLE;
        Comment comment = interactionRepository.createComment(bookId, chapterId, actor.id(), actor.name(), normalizedContent, status);
        audit("comment=" + comment.id() + " book=" + bookId + " user=" + actor.id() + " state=" + status);
        return comment;
    }
    public List<Comment> comments(long bookId) {
        publishedBook(bookId);
        return interactionRepository.findVisibleComments(bookId);
    }
    public CommentPage publicComments(long bookId, Long chapterId, int page, int size) {
        publishedBook(bookId);
        if (chapterId == null) {
            return interactionRepository.findPublicBookLevelComments(bookId, page, size);
        }
        requirePublicPreviewChapter(bookId, chapterId);
        return interactionRepository.findPublicComments(bookId, chapterId, page, size);
    }
    public CommentPage readerComments(CurrentUser actor, long bookId, Long chapterId, int page, int size) {
        ensureActive(actor.id());
        publishedBook(bookId);
        if (chapterId == null) {
            return interactionRepository.findPublicBookLevelComments(bookId, page, size);
        }
        requireReadablePublishedChapter(actor, bookId, chapterId);
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
     * A book owner may give the station owner a reasoned recommendation for a queued comment.
     * This deliberately leaves the interaction in PENDING_REVIEW: final visibility stays with the
     * administrator review endpoint.
     */
    @Transactional
    public AuthorModerationAdvice adviseOnComment(
            long authorUserId,
            long bookId,
            long commentId,
            boolean recommendVisible,
            String reason) {
        ensureActive(authorUserId);
        owned(authorUserId, bookId);
        String normalizedReason = requireTextAtMost(reason, "author moderation reason is required", 1024).trim();
        AuthorModerationAdvice advice = interactionRepository.adviseOnComment(
                authorUserId, bookId, commentId, recommendVisible, normalizedReason);
        audit("author comment moderation advice=" + commentId + " book=" + bookId + " user=" + authorUserId
                + " recommendation=" + advice.recommendation());
        return advice;
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
        return annotateParagraph(new CurrentUser(userId, userName, Set.of(Role.READER), false), bookId, chapterId,
                paragraphIndex, selectionStart, selectionEnd, selectedText, note, shareIntent);
    }
    @Transactional
    public ParagraphAnnotation annotateParagraph(
            CurrentUser actor,
            long bookId,
            long chapterId,
            int paragraphIndex,
            int selectionStart,
            int selectionEnd,
            String selectedText,
            String note,
            boolean shareIntent) {
        ensureActive(actor.id());
        publishedBook(bookId);
        requireReadablePublishedChapter(actor, bookId, chapterId);
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
                actor.id(),
                actor.name(),
                paragraphIndex,
                selectionStart,
                selectionEnd,
                normalizedSelectedText,
                normalizedNote,
                shareIntent,
                status);
        audit("paragraph annotation=" + annotation.id() + " book=" + bookId + " chapter=" + chapterId
                + " user=" + actor.id() + " share=" + shareIntent + " state=" + status);
        return annotation;
    }
    public ParagraphAnnotationPage publicParagraphAnnotations(long bookId, long chapterId, int page, int size) {
        publishedBook(bookId);
        requirePublicPreviewChapter(bookId, chapterId);
        return interactionRepository.findPublicParagraphAnnotations(bookId, chapterId, page, size);
    }
    /**
     * Paid/member/management readers may inspect the same approved public-share projection for a
     * readable later chapter. The public endpoint remains preview-only so it cannot be replayed
     * without the current account's entitlement check.
     */
    public ParagraphAnnotationPage readerPublicParagraphAnnotations(
            CurrentUser actor, long bookId, long chapterId, int page, int size) {
        ensureActive(actor.id());
        requireReadablePublishedChapter(actor, bookId, chapterId);
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
    /** See {@link #adviseOnComment(long, long, long, boolean, String)}. */
    @Transactional
    public AuthorModerationAdvice adviseOnParagraphAnnotation(
            long authorUserId,
            long bookId,
            long annotationId,
            boolean recommendVisible,
            String reason) {
        ensureActive(authorUserId);
        owned(authorUserId, bookId);
        String normalizedReason = requireTextAtMost(reason, "author moderation reason is required", 1024).trim();
        AuthorModerationAdvice advice = interactionRepository.adviseOnParagraphAnnotation(
                authorUserId, bookId, annotationId, recommendVisible, normalizedReason);
        audit("author paragraph annotation moderation advice=" + annotationId + " book=" + bookId
                + " user=" + authorUserId + " recommendation=" + advice.recommendation());
        return advice;
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
        CommercialRules rules = commercialRuleService.current();
        InteractionRepository.VoteReceipt receipt = interactionRepository.recordVote(
                userId,
                bookId,
                type,
                rules.voteLimit(normalizedVoteType(type)));
        audit("vote book=" + bookId + " user=" + userId + " type=" + receipt.type());
        return Map.of(
                "type", receipt.type(),
                "count", receipt.count(),
                "remaining", receipt.remaining(),
                "limit", receipt.limit());
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
        CommercialRules rules = commercialRuleService.current();
        if (amount < rules.rewardMinimumTokens() || amount > rules.rewardMaximumTokensPerReward()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reward amount is outside the configured range");
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
        walletRepository.reserveRewardDailyQuota(
                userId,
                java.time.LocalDate.now(java.time.ZoneId.of("Asia/Shanghai")),
                amount,
                rules.rewardMaximumTokensPerDay());
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
        List<AuthorApplication> applications = operationsRepository.lockAuthorApplicationsForUser(userId);
        if (operationsRepository.findAuthorProfileForUpdate(userId).isPresent()) {
            throw new IllegalStateException("an approved author cannot submit another application");
        }
        reapplyAvailableAt(applications).ifPresent(reapplyAvailableAt -> {
            if (reapplyAvailableAt.isAfter(Instant.now())) {
                throw new IllegalStateException("author application can be resubmitted after " + reapplyAvailableAt);
            }
        });
        AuthorApplication application = operationsRepository.createAuthorApplication(
                userId,
                requireTextAtMost(penName, "pen name is required", 128).trim(),
                requireTextAtMost(statement, "author application statement is required", 4000));
        audit("author application user=" + userId + " id=" + application.id());
        return application;
    }
    public Optional<AuthorApplication> currentAuthorApplication(long userId) {
        return operationsRepository.findLatestAuthorApplicationForUser(userId).map(this::withLegacyReapplyAvailability);
    }
    public List<AuthorApplication> authorApplications() { return operationsRepository.findPendingAuthorApplications(); }
    @Transactional
    public AuthorApplication decideAuthorApplication(long reviewerUserId,long id,boolean approve,String reason) {
        String normalizedReason = requireTextAtMost(reason, "author application review reason is required", 1024).trim();
        Instant reapplyAvailableAt = approve ? null : Instant.now().plus(authorApplicationPolicy.rejectionCooldown());
        AuthorApplication application = operationsRepository.decideAuthorApplication(
                id, reviewerUserId, approve, normalizedReason, reapplyAvailableAt);
        if (approve) {
            operationsRepository.createAuthorProfile(application);
            authService.grantRole(application.userId(), Role.AUTHOR);
        }
        audit("author application=" + id + " reviewer=" + reviewerUserId + " " + application.status());
        return application;
    }

    private Optional<Instant> reapplyAvailableAt(List<AuthorApplication> applications) {
        return applications.stream()
                .filter(application -> "REJECTED".equals(application.status()))
                .map(this::effectiveReapplyAvailableAt)
                .flatMap(Optional::stream)
                .max(Comparator.naturalOrder());
    }

    private AuthorApplication withLegacyReapplyAvailability(AuthorApplication application) {
        return effectiveReapplyAvailableAt(application)
                .filter(reapplyAvailableAt -> application.reapplyAvailableAt() == null)
                .map(reapplyAvailableAt -> new AuthorApplication(
                        application.id(),
                        application.userId(),
                        application.penName(),
                        application.statement(),
                        application.status(),
                        application.reason(),
                        application.createdAt(),
                        application.decidedAt(),
                        application.decidedByUserId(),
                        reapplyAvailableAt))
                .orElse(application);
    }

    private Optional<Instant> effectiveReapplyAvailableAt(AuthorApplication application) {
        if (!"REJECTED".equals(application.status())) {
            return Optional.empty();
        }
        if (application.reapplyAvailableAt() != null) {
            return Optional.of(application.reapplyAvailableAt());
        }
        if (application.decidedAt() == null) {
            return Optional.empty();
        }
        return Optional.of(application.decidedAt().plus(authorApplicationPolicy.rejectionCooldown()));
    }
    /** Internal active vocabulary projection retained for existing moderation callers. */
    public Set<String> sensitiveWords() { return operationsRepository.sensitiveWords(); }
    public List<SensitiveWord> sensitiveWordEntries() { return operationsRepository.sensitiveWordEntries(); }
    public List<SensitiveWordAudit> sensitiveWordAudits(int limit) {
        if (limit < 1 || limit > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sensitive word audit limit must be between 1 and 100");
        }
        return operationsRepository.sensitiveWordAudits(limit);
    }

    /** Legacy helper retained for persistence fixtures which do not model an operator account. */
    @Transactional
    public void addSensitiveWord(String word) {
        String added = operationsRepository.addSensitiveWord(word);
        audit("sensitive word added word=" + added);
    }

    @Transactional
    public SensitiveWord addSensitiveWord(long operatorUserId, String word) {
        requireOperatorUserId(operatorUserId);
        SensitiveWord created = operationsRepository.createSensitiveWord(word, operatorUserId);
        operationsRepository.recordSensitiveWordAudit(
                created.normalizedWord(), null, created.word(), null, true,
                "CREATED", "站长新增本地敏感词", operatorUserId);
        audit("sensitive-word action=CREATED key=" + created.normalizedWord() + " operator=" + operatorUserId);
        return created;
    }

    @Transactional
    public SensitiveWord updateSensitiveWord(long operatorUserId, String currentNormalizedWord, String word, String reason) {
        requireOperatorUserId(operatorUserId);
        String normalizedReason = requireSensitiveWordReason(reason);
        SensitiveWord current = operationsRepository.lockSensitiveWord(currentNormalizedWord)
                .orElseThrow(() -> new NoSuchElementException("sensitive word not found"));
        String requestedWord = requireSensitiveWordValue(word);
        if (current.word().equals(requestedWord)) {
            throw new IllegalStateException("sensitive word has no changes");
        }
        SensitiveWord updated = operationsRepository.updateSensitiveWord(current, requestedWord, operatorUserId);
        operationsRepository.recordSensitiveWordAudit(
                current.normalizedWord(), current.word(), updated.word(), current.enabled(), updated.enabled(),
                "UPDATED", normalizedReason, operatorUserId);
        audit("sensitive-word action=UPDATED key=" + current.normalizedWord() + " operator=" + operatorUserId);
        return updated;
    }

    @Transactional
    public SensitiveWord setSensitiveWordEnabled(
            long operatorUserId, String currentNormalizedWord, boolean enabled, String reason) {
        requireOperatorUserId(operatorUserId);
        String normalizedReason = requireSensitiveWordReason(reason);
        SensitiveWord current = operationsRepository.lockSensitiveWord(currentNormalizedWord)
                .orElseThrow(() -> new NoSuchElementException("sensitive word not found"));
        if (current.enabled() == enabled) {
            throw new IllegalStateException(enabled ? "sensitive word is already enabled" : "sensitive word is already disabled");
        }
        SensitiveWord updated = operationsRepository.setSensitiveWordEnabled(current, enabled, operatorUserId);
        String action = enabled ? "ENABLED" : "DISABLED";
        operationsRepository.recordSensitiveWordAudit(
                current.normalizedWord(), current.word(), updated.word(), current.enabled(), updated.enabled(),
                action, normalizedReason, operatorUserId);
        audit("sensitive-word action=" + action + " key=" + current.normalizedWord() + " operator=" + operatorUserId);
        return updated;
    }

    @Transactional
    public void deleteSensitiveWord(long operatorUserId, String currentNormalizedWord, String reason) {
        requireOperatorUserId(operatorUserId);
        String normalizedReason = requireSensitiveWordReason(reason);
        SensitiveWord current = operationsRepository.lockSensitiveWord(currentNormalizedWord)
                .orElseThrow(() -> new NoSuchElementException("sensitive word not found"));
        if (current.enabled()) {
            throw new IllegalStateException("sensitive word must be disabled before deletion");
        }
        operationsRepository.deleteSensitiveWord(current);
        operationsRepository.recordSensitiveWordAudit(
                current.normalizedWord(), current.word(), null, current.enabled(), null,
                "DELETED", normalizedReason, operatorUserId);
        audit("sensitive-word action=DELETED key=" + current.normalizedWord() + " operator=" + operatorUserId);
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
                null,
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
        if (cover != null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "book cover is managed only through the media upload endpoint");
        }
        Book updated = new Book(
                book.id(),
                requireTextAtMost(title, "book title is required", 255).trim(),
                book.author(),
                requireTextAtMost(category, "book category is required", 128).trim(),
                book.words(),
                updatedSerialStatus,
                requireTextAtMost(synopsis, "book synopsis is required", 20000),
                null,
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
        requireNotOfflineForAuthorMutation(book);
        String normalizedTitle = requireTextAtMost(title, "volume title is required", 255).trim();
        Volume volume = catalogRepository.createVolume(book.id(), normalizedTitle, catalogRepository.nextVolumeOrder(book.id()));
        audit("create volume=" + volume.id() + " book=" + book.id());
        return volume;
    }

    @Transactional
    public Volume updateVolume(long userId, long bookId, long volumeId, String title) {
        Book book = lockedOwned(userId, bookId);
        requireNotOfflineForAuthorMutation(book);
        Volume volume = lockedVolumeForBook(book, volumeId);
        String normalizedTitle = requireTextAtMost(title, "volume title is required", 255).trim();
        Volume updated = catalogRepository.updateVolumeTitle(volume.id(), normalizedTitle);
        audit("update volume=" + updated.id() + " author=" + userId + " book=" + book.id());
        return updated;
    }

    /**
     * Reorders a book's complete volume list under the parent-book lock.  Parking the current
     * values first avoids transient violations of the unique (book_id, order_no) constraint.
     */
    @Transactional
    public List<Volume> reorderVolume(long userId, long bookId, long volumeId, int orderNo) {
        Book book = lockedOwned(userId, bookId);
        requireNotOfflineForAuthorMutation(book);
        List<Volume> lockedVolumes = catalogRepository.findVolumesByBookIdForUpdate(book.id());
        int sourceIndex = indexOfVolume(lockedVolumes, volumeId);
        if (sourceIndex < 0) {
            lockedVolumeForBook(book, volumeId);
            throw new IllegalStateException("volume was not included in current book ordering");
        }
        if (orderNo < 1 || orderNo > lockedVolumes.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "volume order must be between 1 and " + lockedVolumes.size());
        }
        if (sourceIndex == orderNo - 1) {
            return lockedVolumes;
        }

        List<Volume> reordered = new ArrayList<>(lockedVolumes);
        Volume moved = reordered.remove(sourceIndex);
        reordered.add(orderNo - 1, moved);
        List<Volume> normalized = normalizeVolumeOrders(reordered);
        catalogRepository.parkVolumeOrders(book.id());
        catalogRepository.writeVolumeOrders(normalized);
        audit("reorder volume=" + volumeId + " author=" + userId + " book=" + book.id() + " order=" + orderNo);
        return catalogRepository.findVolumesByBookId(book.id());
    }

    @Transactional
    public VolumeDeleteResult deleteVolume(long userId, long bookId, long volumeId) {
        Book book = lockedOwned(userId, bookId);
        requireNotOfflineForAuthorMutation(book);
        Volume target = lockedVolumeForBook(book, volumeId);
        List<Volume> lockedVolumes = catalogRepository.findVolumesByBookIdForUpdate(book.id());
        if (indexOfVolume(lockedVolumes, target.id()) < 0) {
            throw new IllegalStateException("volume was not included in current book ordering");
        }

        int detachedChapterCount = catalogRepository.detachVolumeChapters(target.id());
        catalogRepository.deleteVolume(target.id());
        List<Volume> remaining = normalizeVolumeOrders(lockedVolumes.stream()
                .filter(volume -> volume.id() != target.id())
                .toList());
        if (!remaining.isEmpty()) {
            catalogRepository.parkVolumeOrders(book.id());
            catalogRepository.writeVolumeOrders(remaining);
        }
        if (awaitingFullWorkReview(book.status())) {
            queueWholeWorkSnapshot(book);
        }
        audit("delete volume=" + target.id() + " author=" + userId + " book=" + book.id()
                + " detached-chapters=" + detachedChapterCount);
        return new VolumeDeleteResult(target.id(), true, detachedChapterCount);
    }

    public List<Chapter> authorChapters(long userId, long bookId) {
        owned(userId, bookId);
        return catalogRepository.findChaptersByBookId(bookId);
    }

    /** Shows an author the retained incremental proposals without exposing them to readers. */
    public List<ChapterCandidate> authorChapterCandidates(long userId, long bookId) {
        owned(userId, bookId);
        return catalogRepository.findChapterCandidatesByBookId(bookId);
    }

    /**
     * Drafts and scheduled chapters are edited in place. A published chapter is never overwritten
     * by an author edit: the proposed replacement is retained as a separate candidate until an
     * administrator decides it.
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
        requireNotOfflineForAuthorMutation(book);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        requireNoPendingCandidate(chapter);
        String normalizedTitle = requireTextAtMost(title, "chapter title is required", 255).trim();
        String normalizedContent = requireTextAtMost(content, "chapter content is required", 20000);
        Long targetVolumeId;
        if (volumeId == null) {
            targetVolumeId = chapter.volumeId();
        } else {
            targetVolumeId = lockedVolumeForBook(book, volumeId).id();
        }
        if (chapter.status() == ChapterStatus.DRAFT || chapter.status() == ChapterStatus.SCHEDULED) {
            int words = updatedWordCount(book.words(), chapter.content(), normalizedContent);
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

        ChapterCandidate candidate = createCandidate(
                book,
                chapter,
                ChapterCandidateType.CHAPTER_REVISION,
                targetVolumeId,
                normalizedTitle,
                normalizedContent,
                userId);
        ContentModerationAudit moderation = contentModerationService.moderateChapterCandidate(
                candidate.id(), normalizedTitle, normalizedContent, ModerationTrigger.PUBLISHED_CHAPTER_REVISION);
        ChapterCandidate pending = updateCandidateModeration(
                candidate,
                moderation,
                incrementalCandidateReviewReason(moderation, ChapterCandidateType.CHAPTER_REVISION, false));
        audit("queue published chapter revision=" + chapter.id() + " candidate=" + pending.id() + " author=" + userId
                + " moderation=" + moderation.decision() + " book=" + book.id());
        return chapter;
    }

    @Transactional
    public void deleteChapter(long userId, long bookId, long chapterId) {
        Book book = lockedOwned(userId, bookId);
        requireNotOfflineForAuthorMutation(book);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        requireNoPendingCandidate(chapter);
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
        requireNotOfflineForAuthorMutation(book);
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

        // An already public work has an independent incremental lifecycle. The source draft
        // reserves its stable chapter id and order, while the candidate owns the proposed text
        // and its moderation evidence.
        if (book.status() == BookStatus.PUBLISHED) {
            Book withDraftWords = copyBook(book, addWords(book.words(), normalizedContent.length()), book.status());
            catalogRepository.updateBook(withDraftWords);
            return submitPublishedNewChapter(withDraftWords, draft, userId, ModerationTrigger.CHAPTER_SUBMISSION, Instant.now());
        }

        ContentModerationAudit moderation = contentModerationService.moderateChapter(
                draft.id(), normalizedTitle, normalizedContent, ModerationTrigger.CHAPTER_SUBMISSION);
        boolean mayPublishChapter = moderation.decision().permitsAutomaticChapterPublication();
        ChapterStatus chapterStatus = mayPublishChapter ? ChapterStatus.PUBLISHED : ChapterStatus.NEEDS_REVIEW;
        BookStatus bookStatus = statusAfterInitialChapterSubmission(book.status());
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
        if (awaitingFullWorkReview(submittedBook.status())) {
            queueWholeWorkSnapshot(submittedBook);
        }
        audit("chapter=" + persisted.id() + " state=" + chapterStatus + " moderation=" + moderation.decision());
        return persisted;
    }

    /** Submits an existing draft after it has been edited or returned by a reviewer. */
    @Transactional
    public Chapter submitChapter(long userId, long bookId, long chapterId) {
        Book book = lockedOwned(userId, bookId);
        requireNotOfflineForAuthorMutation(book);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        requireNoPendingCandidate(chapter);
        if (chapter.status() != ChapterStatus.DRAFT) {
            throw new IllegalStateException("only draft chapters can be submitted");
        }
        if (book.status() == BookStatus.PUBLISHED) {
            return submitPublishedNewChapter(book, chapter, userId, ModerationTrigger.CHAPTER_SUBMISSION, Instant.now());
        }
        ContentModerationAudit moderation = contentModerationService.moderateChapter(
                chapter.id(), chapter.title(), chapter.content(), ModerationTrigger.CHAPTER_SUBMISSION);
        boolean mayPublishChapter = moderation.decision().permitsAutomaticChapterPublication();
        ChapterStatus chapterStatus = mayPublishChapter ? ChapterStatus.PUBLISHED : ChapterStatus.NEEDS_REVIEW;
        BookStatus bookStatus = statusAfterInitialChapterSubmission(book.status());
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
        if (awaitingFullWorkReview(submittedBook.status())) {
            queueWholeWorkSnapshot(submittedBook);
        }
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
        requireNotOfflineForAuthorMutation(book);
        Chapter chapter = lockedChapterForBook(book, chapterId);
        requireNoPendingCandidate(chapter);
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
     * direct submission. A non-pass for an already public work holds only the candidate chapter,
     * never the work's public visibility.
     */
    @Transactional
    public DuePublicationResult publishDueChapters(long userId, Instant dueAt) {
        requireDueTime(dueAt);
        return publishDueCandidates(
                catalogRepository.findDueScheduledChaptersByAuthorId(userId, dueAt),
                dueAt,
                userId);
    }

    /** Trusted scheduler entry point with the same incremental lifecycle as an author run. */
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
            if (book.status() == BookStatus.OFFLINE || book.status() == BookStatus.NEEDS_REVIEW) {
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

            if (book.status() == BookStatus.PUBLISHED) {
                Chapter outcome = submitPublishedNewChapter(
                        book, chapter, book.authorId(), ModerationTrigger.SCHEDULED_PUBLICATION, dueAt);
                if (outcome.status() == ChapterStatus.PUBLISHED) {
                    published.add(outcome);
                } else {
                    needsReview.add(outcome);
                }
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
                Book heldBook = copyBook(
                        book,
                        book.words(),
                        statusAfterInitialChapterSubmission(book.status()));
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
        requireNotOfflineForAuthorMutation(book);
        if (book.status() != BookStatus.DRAFT && book.status() != BookStatus.REJECTED) {
            throw new IllegalStateException("only draft or rejected books can be submitted for review");
        }
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
        if (book.status() != BookStatus.PENDING_REVIEW) {
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

    /**
     * Decides one incremental candidate. This path deliberately bypasses whole-work snapshots:
     * an existing published chapter remains public until the proposed replacement is atomically
     * applied here.
     */
    @Transactional
    public ChapterCandidate reviewChapterCandidate(long reviewerUserId, long candidateId, boolean approve, String reason) {
        requireOperatorUserId(reviewerUserId);
        ChapterCandidate located = catalogRepository.findChapterCandidateById(candidateId)
                .orElseThrow(() -> new NoSuchElementException("chapter candidate not found"));
        // Keep the same lock order as author edits: book, source chapter, then candidate.
        Book book = lockedBook(located.bookId());
        Chapter target = lockedChapterForBook(book, located.targetChapterId());
        ChapterCandidate candidate = catalogRepository.findChapterCandidateByIdForUpdate(candidateId)
                .orElseThrow(() -> new NoSuchElementException("chapter candidate not found"));
        if (candidate.bookId() != book.id() || candidate.targetChapterId() != target.id()) {
            throw new IllegalStateException("chapter candidate no longer matches its source chapter");
        }
        if (book.status() != BookStatus.PUBLISHED) {
            throw new IllegalStateException("incremental candidates can only be reviewed for published books");
        }
        if (candidate.status() != ChapterCandidateStatus.PENDING_REVIEW) {
            throw new IllegalStateException("chapter candidate is no longer awaiting review");
        }
        String normalizedReason = requireTextAtMost(reason, "review reason is required", 900);
        if (candidate.moderationAuditId() == null) {
            throw new IllegalStateException("chapter candidate is missing moderation evidence");
        }

        Instant reviewedAt = Instant.now();
        if (approve) {
            if (candidate.type() == ChapterCandidateType.NEW_CHAPTER) {
                if (target.status() != ChapterStatus.DRAFT) {
                    throw new IllegalStateException("new chapter candidate source is not awaiting review");
                }
            } else if (target.status() != ChapterStatus.PUBLISHED) {
                throw new IllegalStateException("chapter revision source is no longer published");
            }
            Chapter applied = candidateAppliedChapter(target, candidate, reviewedAt);
            catalogRepository.updateChapter(applied);
            if (candidate.type() == ChapterCandidateType.CHAPTER_REVISION) {
                catalogRepository.updateBook(copyBook(
                        book,
                        updatedWordCount(book.words(), target.content(), candidate.content()),
                        book.status()));
            }
            ChapterCandidate approved = resolveCandidate(
                    candidate, ChapterCandidateStatus.APPROVED, normalizedReason, reviewerUserId, reviewedAt);
            contentModerationReviewService.recordCandidateEvidence(
                    book.id(), reviewerUserId, true, normalizedReason, candidate.moderationAuditId());
            audit("review chapter candidate=" + candidate.id() + " reviewer=" + reviewerUserId + " APPROVED");
            return approved;
        }

        if (candidate.type() == ChapterCandidateType.NEW_CHAPTER) {
            if (target.status() != ChapterStatus.DRAFT) {
                throw new IllegalStateException("new chapter candidate source is no longer awaiting review");
            }
            catalogRepository.updateChapter(new Chapter(
                    target.id(),
                    target.bookId(),
                    target.volumeId(),
                    target.title(),
                    target.content(),
                    false,
                    ChapterStatus.DRAFT,
                    null,
                    null,
                    "增量审核驳回：" + normalizedReason,
                    target.orderNo()));
        }
        ChapterCandidate rejected = resolveCandidate(
                candidate, ChapterCandidateStatus.REJECTED, normalizedReason, reviewerUserId, reviewedAt);
        contentModerationReviewService.recordCandidateEvidence(
                book.id(), reviewerUserId, false, normalizedReason, candidate.moderationAuditId());
        audit("review chapter candidate=" + candidate.id() + " reviewer=" + reviewerUserId + " REJECTED");
        return rejected;
    }

    public BookPresentationPage authorBooks(long userId, int page, int size) {
        return bookPages().authorBooks(userId, page, size);
    }

    public BookPresentationPage pendingBooks(int page, int size) {
        return bookPages().wholeBookReviews(page, size);
    }

    /** A scoped, database-paged queue keeps incremental candidates separate from whole-work review. */
    public ModerationReviewQueuePage reviewQueue(ModerationReviewScope scope, int page, int size) {
        return bookPages().moderationQueue(scope, page, size);
    }
    public BookPresentationPage availabilityManagedBooks(int page, int size) {
        return bookPages().availabilityManagedBooks(page, size);
    }

    /**
     * Removes a currently public work from every public catalog query. The row remains available
     * to its author and administrators, and the mandatory reason is retained independently of a
     * transient dashboard log.
     */
    @Transactional
    public Book takeDownBook(long operatorUserId, long bookId, String reason) {
        requireOperatorUserId(operatorUserId);
        String normalizedReason = requireTextAtMost(reason, "book takedown reason is required", 1024).trim();
        Book book = lockedBook(bookId);
        if (book.status() != BookStatus.PUBLISHED) {
            throw new IllegalStateException("only published books can be taken down");
        }
        Book updated = copyBook(book, book.words(), BookStatus.OFFLINE);
        catalogRepository.updateBook(updated);
        if (homeCarouselService != null) {
            homeCarouselService.disableSlidesForBook(book.id(), operatorUserId, normalizedReason);
        }
        catalogRepository.recordBookStatusAudit(
                book.id(), "TAKEDOWN", book.status(), updated.status(), normalizedReason, operatorUserId);
        audit("book-takedown operator=" + operatorUserId + " book=" + book.id());
        return updated;
    }

    /**
     * A takedown is never reversed directly to public visibility. Reinstatement creates fresh
     * immutable evidence and returns the work to the normal full-work human review queue.
     */
    @Transactional
    public Book restoreBookForReview(long operatorUserId, long bookId, String reason) {
        requireOperatorUserId(operatorUserId);
        String normalizedReason = requireTextAtMost(reason, "book restoration reason is required", 1024).trim();
        Book book = lockedBook(bookId);
        if (book.status() != BookStatus.OFFLINE) {
            throw new IllegalStateException("only offline books can be restored for review");
        }
        Book updated = copyBook(book, book.words(), BookStatus.PENDING_REVIEW);
        catalogRepository.updateBook(updated);
        queueWholeWorkSnapshot(updated);
        catalogRepository.recordBookStatusAudit(
                book.id(), "RESTORE_FOR_REVIEW", book.status(), updated.status(), normalizedReason, operatorUserId);
        audit("book-restore-for-review operator=" + operatorUserId + " book=" + book.id());
        return updated;
    }

    public BookStatusAuditPage bookStatusAudits(long bookId, int page, int size) {
        book(bookId);
        return bookPages().statusAudits(bookId, page, size);
    }

    public BookStatusAuditPage authorBookStatusAudits(long userId, long bookId, int page, int size) {
        owned(userId, bookId);
        return bookPages().statusAudits(bookId, page, size);
    }
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

    private static int indexOfVolume(List<Volume> volumes, long volumeId) {
        for (int index = 0; index < volumes.size(); index++) {
            if (volumes.get(index).id() == volumeId) {
                return index;
            }
        }
        return -1;
    }

    private static List<Volume> normalizeVolumeOrders(List<Volume> volumes) {
        List<Volume> normalized = new ArrayList<>(volumes.size());
        for (int index = 0; index < volumes.size(); index++) {
            Volume volume = volumes.get(index);
            normalized.add(new Volume(
                    volume.id(), volume.bookId(), volume.title(), index + 1, volume.createdAt()));
        }
        return normalized;
    }

    /** Creates an immutable proposal before the moderation call so its audit has a durable id. */
    private ChapterCandidate createCandidate(
            Book book,
            Chapter target,
            ChapterCandidateType type,
            Long volumeId,
            String title,
            String content,
            long authorUserId) {
        return catalogRepository.createChapterCandidate(new ChapterCandidate(
                0,
                book.id(),
                target.id(),
                volumeId,
                type,
                title,
                content,
                target.orderNo(),
                ChapterCandidateStatus.PENDING_REVIEW,
                "",
                null,
                authorUserId,
                null,
                null,
                null));
    }

    private void requireNoPendingCandidate(Chapter chapter) {
        if (catalogRepository.findPendingCandidateForTargetChapterForUpdate(chapter.id()).isPresent()) {
            throw new IllegalStateException("chapter already has an incremental candidate awaiting review");
        }
    }

    /**
     * Handles an incremental new chapter for a public work. Automatic passes are applied at once;
     * every other moderation result remains a durable candidate and leaves its parent public.
     */
    private Chapter submitPublishedNewChapter(
            Book book,
            Chapter source,
            long authorUserId,
            ModerationTrigger trigger,
            Instant publicationAt) {
        requireNoPendingCandidate(source);
        ChapterCandidate candidate = createCandidate(
                book,
                source,
                ChapterCandidateType.NEW_CHAPTER,
                source.volumeId(),
                source.title(),
                source.content(),
                authorUserId);
        ContentModerationAudit moderation = contentModerationService.moderateChapterCandidate(
                candidate.id(), candidate.title(), candidate.content(), trigger);
        if (moderation.decision().permitsAutomaticChapterPublication()) {
            Chapter released = candidateAppliedChapter(source, candidate, publicationAt);
            catalogRepository.updateChapter(released);
            resolveCandidate(candidate, ChapterCandidateStatus.APPROVED, "", null, null, moderation.id());
            audit("publish incremental chapter=" + released.id() + " candidate=" + candidate.id()
                    + " moderation=" + moderation.decision());
            return released;
        }

        String reason = incrementalCandidateReviewReason(moderation, ChapterCandidateType.NEW_CHAPTER,
                trigger == ModerationTrigger.SCHEDULED_PUBLICATION);
        Chapter held = new Chapter(
                source.id(),
                source.bookId(),
                source.volumeId(),
                source.title(),
                source.content(),
                false,
                ChapterStatus.DRAFT,
                null,
                null,
                reason,
                source.orderNo());
        catalogRepository.updateChapter(held);
        ChapterCandidate pending = updateCandidateModeration(candidate, moderation, reason);
        audit("hold incremental chapter=" + source.id() + " candidate=" + pending.id()
                + " moderation=" + moderation.decision());
        return held;
    }

    private ChapterCandidate updateCandidateModeration(
            ChapterCandidate candidate, ContentModerationAudit moderation, String reviewReason) {
        return resolveCandidate(
                candidate,
                ChapterCandidateStatus.PENDING_REVIEW,
                reviewReason,
                null,
                null,
                moderation.id());
    }

    private ChapterCandidate resolveCandidate(
            ChapterCandidate candidate,
            ChapterCandidateStatus status,
            String reviewReason,
            Long reviewerUserId,
            Instant reviewedAt) {
        return resolveCandidate(
                candidate, status, reviewReason, reviewerUserId, reviewedAt, candidate.moderationAuditId());
    }

    private ChapterCandidate resolveCandidate(
            ChapterCandidate candidate,
            ChapterCandidateStatus status,
            String reviewReason,
            Long reviewerUserId,
            Instant reviewedAt,
            Long moderationAuditId) {
        return catalogRepository.updateChapterCandidate(new ChapterCandidate(
                candidate.id(),
                candidate.bookId(),
                candidate.targetChapterId(),
                candidate.volumeId(),
                candidate.type(),
                candidate.title(),
                candidate.content(),
                candidate.orderNo(),
                status,
                reviewReason,
                moderationAuditId,
                candidate.createdByUserId(),
                candidate.createdAt(),
                reviewerUserId,
                reviewedAt));
    }

    private static Chapter candidateAppliedChapter(Chapter target, ChapterCandidate candidate, Instant publishedAt) {
        return new Chapter(
                target.id(),
                target.bookId(),
                candidate.volumeId(),
                candidate.title(),
                candidate.content(),
                true,
                ChapterStatus.PUBLISHED,
                null,
                publishedAt,
                "",
                target.orderNo());
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
        return status == BookStatus.PENDING_REVIEW;
    }
    private static void requireOperatorUserId(long operatorUserId) {
        if (operatorUserId <= 0) {
            throw new IllegalArgumentException("operator user id is required");
        }
    }
    private static void requireNotOfflineForAuthorMutation(Book book) {
        if (book.status() == BookStatus.OFFLINE) {
            throw new IllegalStateException("offline books can only be restored by an administrator");
        }
        if (book.status() == BookStatus.NEEDS_REVIEW) {
            throw new IllegalStateException("historical review state requires administrator triage");
        }
    }
    /** A chapter submission may queue an initial work but can never withdraw an existing public work. */
    private static BookStatus statusAfterInitialChapterSubmission(BookStatus current) {
        // Incremental problems are represented by chapter candidates, never by withdrawing an
        // already public parent work from reader-facing queries.
        if (current == BookStatus.PUBLISHED) return BookStatus.PUBLISHED;
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
                null,
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

    private String fullBookAccessSource(CurrentUser actor, Book book) {
        if (actor == null) return null;
        if (actor.roles().contains(Role.ADMIN)) return "ADMIN";
        if (actor.roles().contains(Role.AUTHOR) && actor.id() == book.authorId()) return "AUTHOR";
        if (walletRepository.hasBookEntitlement(actor.id(), book.id())) return "BOOK_ENTITLEMENT";
        if (walletRepository.hasActiveMembership(actor.id(), Instant.now())) return "MEMBERSHIP";
        return null;
    }

    /** Validates both publication and the same entitlement policy used by reader content views. */
    private void requireReadablePublishedChapter(CurrentUser actor, long bookId, long chapterId) {
        Book book = publishedBook(bookId);
        List<Chapter> chapters = publishedChapters(bookId);
        int chapterIndex = -1;
        for (int index = 0; index < chapters.size(); index++) {
            if (chapters.get(index).id() == chapterId) {
                chapterIndex = index;
                break;
            }
        }
        if (chapterIndex < 0) {
            throw new IllegalArgumentException("chapter is not published for this book");
        }
        if (chapterIndex == 0 || fullBookAccessSource(actor, book) != null) return;
        throw new SecurityException("reading entitlement is required for this chapter");
    }

    /** Public annotation excerpts must not become a side channel around a locked chapter body. */
    private void requirePublicPreviewChapter(long bookId, long chapterId) {
        List<Chapter> chapters = publishedChapters(bookId);
        if (chapters.stream().noneMatch(chapter -> chapter.id() == chapterId)) {
            throw new IllegalArgumentException("chapter is not published for this book");
        }
        if (chapters.isEmpty() || chapters.getFirst().id() != chapterId) {
            throw new SecurityException("reading entitlement is required for this chapter");
        }
    }

    private static CurrentUser readerActor(long userId) {
        return new CurrentUser(userId, "", Set.of(Role.READER), false);
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
    private static String requireSensitiveWordValue(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sensitive word is required");
        }
        String normalized = value.trim();
        if (normalized.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sensitive word is too long");
        }
        if (normalized.chars().anyMatch(Character::isISOControl)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sensitive word contains control characters");
        }
        return normalized;
    }
    private static String requireSensitiveWordReason(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sensitive word change reason is required");
        }
        String normalized = value.trim().replace('\n', ' ').replace('\r', ' ');
        if (normalized.length() > 512) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sensitive word change reason is too long");
        }
        return normalized;
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

    private static String incrementalCandidateReviewReason(
            ContentModerationAudit moderation,
            ChapterCandidateType type,
            boolean scheduled) {
        if (type == ChapterCandidateType.CHAPTER_REVISION
                && moderation.decision().permitsAutomaticChapterPublication()) {
            return "已修改已发布章节，等待增量审核";
        }
        String action = scheduled ? "定时发布" : "章节发布";
        return switch (moderation.decision()) {
            case PASS, SIMULATED_PASS -> "等待增量审核";
            case LOCAL_SENSITIVE_WORD -> "命中本地敏感词，已暂停" + action + "，等待增量审核";
            case MANUAL_REVIEW, REJECT -> "模型审核建议人工复核，已暂停" + action + "，等待增量审核";
            case MODEL_UNAVAILABLE, MODEL_ERROR, INVALID_OUTPUT -> "模型审核不可用或结果无效，已暂停" + action + "，等待增量审核";
        };
    }
    private String authorPenName(long userId) {
        return operationsRepository.findAuthorProfile(userId)
                .map(AuthorProfile::penName)
                // Existing local fixtures predate author applications. Their persisted catalog
                // record keeps the legacy author workflow usable without a code-level name.
                .or(() -> catalogRepository.findAuthorNameByAuthorId(userId))
                .orElseThrow(() -> new IllegalStateException("approved author profile is required to create a book"));
    }
    private BookPageService bookPages() {
        return bookPageService;
    }
    private boolean containsSensitive(String value) { return operationsRepository.containsSensitiveWord(value); }
    private void audit(String action) { auditTrail.record(action); }
    private void ensureActive(long userId) { authService.requireEnabled(userId); }
    private static String normalizeRedemptionCode(String code) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("兑换码不能为空");
        return code.trim().toUpperCase(Locale.ROOT);
    }
    private static String normalizedVoteType(String value) {
        String normalized = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("recommendation", "monthly").contains(normalized)) {
            throw new IllegalArgumentException("unsupported vote type");
        }
        return normalized;
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
