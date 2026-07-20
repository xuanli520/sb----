package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NovelStore {
    private final AtomicLong commentIds = new AtomicLong(2000);
    private final AtomicLong bookmarkIds = new AtomicLong(3000);
    private final AtomicLong applicationIds = new AtomicLong(4000);
    private final Map<Long, Set<Long>> shelves = new ConcurrentHashMap<>();
    private final AuditTrail auditTrail;
    private final CatalogRepository catalogRepository;
    private final WalletRepository walletRepository;
    private final Map<Long, Integer> points = new ConcurrentHashMap<>();
    private final Map<Long, ReadingPreference> preferences = new ConcurrentHashMap<>();
    private final Map<Long, Map<Long, ReadingProgress>> progress = new ConcurrentHashMap<>();
    private final Map<Long, List<Bookmark>> bookmarks = new ConcurrentHashMap<>();
    private final Map<Long, List<Comment>> comments = new ConcurrentHashMap<>();
    private final Map<Long, Map<Long, Integer>> ratings = new ConcurrentHashMap<>();
    private final Map<Long, Set<Long>> recommendationVotes = new ConcurrentHashMap<>();
    private final Map<Long, Set<Long>> monthlyVotes = new ConcurrentHashMap<>();
    private final Map<Long, AuthorApplication> authorApplications = new ConcurrentHashMap<>();
    private final Set<String> sensitiveWords = ConcurrentHashMap.newKeySet();
    private final Set<Long> disabledUsers = ConcurrentHashMap.newKeySet();
    public NovelStore(AuditTrail auditTrail, CatalogRepository catalogRepository, WalletRepository walletRepository) {
        this.auditTrail = auditTrail;
        this.catalogRepository = catalogRepository;
        this.walletRepository = walletRepository;
        sensitiveWords.add("敏感词");
    }
    public List<Book> published(String query, String category, String status) {
        return catalogRepository.findPublished(query, category, status);
    }
    public Book book(long id) { return catalogRepository.findById(id).orElseThrow(()->new NoSuchElementException("book not found")); }
    public Book publishedBook(long id) { Book b=book(id); if (b.status()!=BookStatus.PUBLISHED) throw new NoSuchElementException("book not published"); return b; }
    public List<Chapter> publishedChapters(long id) { return catalogRepository.findPublishedChaptersByBookId(id); }
    public boolean toggleShelf(long userId, long bookId) { book(bookId); Set<Long> shelf=shelves.computeIfAbsent(userId, unused -> ConcurrentHashMap.newKeySet()); return shelf.contains(bookId) ? shelf.remove(bookId) : shelf.add(bookId); }
    public Set<Long> shelf(long userId) { return Set.copyOf(shelves.getOrDefault(userId, Set.of())); }
    public int checkin(long userId) { ensureActive(userId); return points.merge(userId, 10, Integer::sum); }
    public int pointBalance(long userId) { return points.getOrDefault(userId, 0); }
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
    public ReadingPreference preference(long userId) { return preferences.getOrDefault(userId, ReadingPreference.defaults()); }
    public ReadingPreference savePreference(long userId, ReadingPreference preference) { ensureActive(userId); validatePreference(preference); preferences.put(userId, preference); return preference; }
    public ReadingProgress saveProgress(long userId, long bookId, long chapterId, int offset) { ensureActive(userId); publishedBook(bookId); if (publishedChapters(bookId).stream().noneMatch(c -> c.id()==chapterId)) throw new IllegalArgumentException("chapter is not published for this book"); if (offset<0) throw new IllegalArgumentException("offset must be non-negative"); ReadingProgress item=new ReadingProgress(bookId,chapterId,offset,Instant.now()); progress.computeIfAbsent(userId, ignored->new ConcurrentHashMap<>()).put(bookId,item); return item; }
    public List<ReadingProgress> progress(long userId) { return progress.getOrDefault(userId, Map.of()).values().stream().sorted(Comparator.comparing(ReadingProgress::updatedAt).reversed()).toList(); }
    public Bookmark bookmark(long userId,long bookId,long chapterId,int offset,String note) { ensureActive(userId); saveProgress(userId,bookId,chapterId,offset); Bookmark item=new Bookmark(bookmarkIds.incrementAndGet(),bookId,chapterId,offset,note==null?"":note,Instant.now()); bookmarks.computeIfAbsent(userId,ignored->Collections.synchronizedList(new ArrayList<>())).add(item); return item; }
    public List<Bookmark> bookmarks(long userId,long bookId) { return bookmarks.getOrDefault(userId,List.of()).stream().filter(item->item.bookId()==bookId).toList(); }
    public Comment comment(long userId,String userName,long bookId,Long chapterId,String content) { ensureActive(userId); publishedBook(bookId); if(chapterId!=null && publishedChapters(bookId).stream().noneMatch(c->c.id()==chapterId)) throw new IllegalArgumentException("chapter is not published for this book"); String state=containsSensitive(content)?"PENDING_REVIEW":"VISIBLE"; Comment item=new Comment(commentIds.incrementAndGet(),bookId,chapterId,userId,userName,content,state,Instant.now()); comments.computeIfAbsent(bookId,ignored->Collections.synchronizedList(new ArrayList<>())).add(item); return item; }
    public List<Comment> comments(long bookId) { publishedBook(bookId); return comments.getOrDefault(bookId,List.of()).stream().filter(item->item.status().equals("VISIBLE")).toList(); }
    public double rate(long userId,long bookId,int rating) { ensureActive(userId); publishedBook(bookId); if(rating<1||rating>5) throw new IllegalArgumentException("rating must be between 1 and 5"); ratings.computeIfAbsent(bookId,ignored->new ConcurrentHashMap<>()).put(userId,rating); return ratings.get(bookId).values().stream().mapToInt(Integer::intValue).average().orElse(0); }
    public Map<String,Object> vote(long userId,long bookId,String type) { ensureActive(userId); publishedBook(bookId); Set<Long> voters=switch(type){case "recommendation"->recommendationVotes.computeIfAbsent(bookId,ignored->ConcurrentHashMap.newKeySet());case "monthly"->monthlyVotes.computeIfAbsent(bookId,ignored->ConcurrentHashMap.newKeySet());default->throw new IllegalArgumentException("unsupported vote type");}; if(!voters.add(userId)) throw new IllegalStateException("already voted for this book"); return Map.of("type",type,"count",voters.size()); }
    @Transactional
    public Map<String,Object> reward(long userId,long bookId,int amount) {
        ensureActive(userId);
        Book book = publishedBook(bookId);
        if(amount<=0) throw new IllegalArgumentException("amount must be positive");
        long rewardId = walletRepository.createRewardRecord(userId, book.authorId(), bookId, amount);
        int balance = walletRepository.debitTokens(
                userId,
                amount,
                "BOOK_REWARD",
                "REWARD",
                Long.toString(rewardId));
        audit("reward book="+bookId+" user="+userId+" amount="+amount);
        return Map.of("bookId",bookId,"amount",amount,"balance",balance);
    }
    @Transactional
    public Map<String,Object> purchase(long userId,long bookId,int price) {
        ensureActive(userId);
        publishedBook(bookId);
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
    public AuthorApplication applyAuthor(long userId,String penName,String statement) { ensureActive(userId); AuthorApplication old=authorApplications.get(userId); if(old!=null&&old.status().equals("PENDING")) throw new IllegalStateException("an author application is already pending"); AuthorApplication item=new AuthorApplication(applicationIds.incrementAndGet(),userId,penName,statement,"PENDING","",Instant.now()); authorApplications.put(userId,item); audit("author application user="+userId); return item; }
    public List<AuthorApplication> authorApplications() { return authorApplications.values().stream().filter(item->item.status().equals("PENDING")).toList(); }
    public AuthorApplication decideAuthorApplication(long id,boolean approve,String reason) { AuthorApplication app=authorApplications.values().stream().filter(item->item.id()==id).findFirst().orElseThrow(()->new NoSuchElementException("author application not found")); AuthorApplication updated=new AuthorApplication(app.id(),app.userId(),app.penName(),app.statement(),approve?"APPROVED":"REJECTED",reason,app.createdAt()); authorApplications.put(app.userId(),updated); audit("author application="+id+" "+updated.status()); return updated; }
    public Set<String> sensitiveWords() { return Set.copyOf(sensitiveWords); }
    public void addSensitiveWord(String word) { if(word==null||word.isBlank()) throw new IllegalArgumentException("sensitive word is required"); sensitiveWords.add(word.trim()); audit("sensitive word added"); }
    public boolean setUserEnabled(long userId,boolean enabled) { if(enabled) disabledUsers.remove(userId); else disabledUsers.add(userId); audit("user="+userId+" enabled="+enabled); return enabled; }
    @Transactional
    public Book createBook(long userId, String title, String category, String synopsis) { Book b=catalogRepository.createBook(new Book(0,title,"林墨",category,0,"连载中",synopsis,"#563d7c",BookStatus.DRAFT,userId,0)); audit("create book="+b.id()); return b; }
    @Transactional
    public Chapter addChapter(long userId,long bookId,String title,String content,boolean submit) { Book b=lockedOwned(userId,bookId); boolean risky=containsSensitive(content); BookStatus state=submit ? (risky ? BookStatus.NEEDS_REVIEW : BookStatus.PENDING_REVIEW) : b.status(); catalogRepository.updateBook(new Book(b.id(),b.title(),b.author(),b.category(),b.words()+content.length(),b.serialStatus(),b.synopsis(),b.cover(),state,b.authorId(),b.heat())); Chapter c=catalogRepository.createChapter(new Chapter(0,bookId,title,content,!risky && submit,catalogRepository.nextChapterOrder(bookId))); audit("chapter="+c.id()+" state="+state); return c; }
    @Transactional
    public Book submitBook(long userId,long bookId) { Book b=owned(userId,bookId); Book updated=new Book(b.id(),b.title(),b.author(),b.category(),b.words(),b.serialStatus(),b.synopsis(),b.cover(),BookStatus.PENDING_REVIEW,b.authorId(),b.heat()); return catalogRepository.updateBook(updated); }
    @Transactional
    public Book review(long id, boolean approve, String reason) { Book b=book(id); Book u=new Book(b.id(),b.title(),b.author(),b.category(),b.words(),b.serialStatus(),b.synopsis(),b.cover(),approve?BookStatus.PUBLISHED:BookStatus.REJECTED,b.authorId(),b.heat()); catalogRepository.updateBook(u); audit("review book="+id+" "+u.status()+" reason="+reason); return u; }
    public List<Book> authorBooks(long userId) { return catalogRepository.findByAuthorId(userId); }
    public List<Book> pending() { return catalogRepository.findPendingReview(); }
    public List<String> audits() { return auditTrail.recent(); }
    private Book owned(long userId,long bookId) { Book b=book(bookId); if(b.authorId()!=userId) throw new SecurityException("resource does not belong to current author"); return b; }
    private Book lockedOwned(long userId,long bookId) { Book b=catalogRepository.findByIdForUpdate(bookId).orElseThrow(()->new NoSuchElementException("book not found")); if(b.authorId()!=userId) throw new SecurityException("resource does not belong to current author"); return b; }
    private boolean containsSensitive(String value) { return sensitiveWords.stream().anyMatch(value::contains); }
    private void audit(String action) { auditTrail.record(action); }
    private void ensureActive(long userId) { if(disabledUsers.contains(userId)) throw new SecurityException("account is disabled"); }
    private static String normalizeRedemptionCode(String code) {
        if (code == null || code.isBlank()) throw new IllegalArgumentException("兑换码不能为空");
        return code.trim().toUpperCase(Locale.ROOT);
    }
    private static int apiAmount(long amount) {
        try { return Math.toIntExact(amount); }
        catch (ArithmeticException exception) { throw new IllegalStateException("兑换金额超出 API 范围", exception); }
    }
    private static void validatePreference(ReadingPreference value) { if(value.fontSize()<14||value.fontSize()>32||value.lineHeight()<120||value.lineHeight()>260||value.brightness()<10||value.brightness()>100) throw new IllegalArgumentException("reading preference is out of range"); if(!Set.of("paper","night","sepia").contains(value.theme())||!Set.of("slide","cover","simulation").contains(value.pageMode())) throw new IllegalArgumentException("unsupported reader setting"); }
}
