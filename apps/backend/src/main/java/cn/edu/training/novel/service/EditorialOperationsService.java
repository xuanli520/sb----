package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.EditorialRecommendation;
import cn.edu.training.novel.domain.EditorialRecommendationAudit;
import cn.edu.training.novel.domain.HotSearchTerm;
import cn.edu.training.novel.domain.HotSearchTermAudit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Transactional operations for the editorial recommendation and hot-search vertical slice.
 *
 * <p>The two ordered resources share one database row lock.  Once held, an operation parks
 * every existing rank in a reserved temporary range, then writes the final dense order.  This
 * avoids the transient unique-index collision caused by directly swapping rank 1 and rank 2.
 * Readers only observe a committed order.</p>
 */
@Service
public class EditorialOperationsService {
    private static final int MAX_PUBLIC_HOT_SEARCH_TERMS = 12;
    private static final int MAX_TERM_LENGTH = 100;

    private final EditorialOperationsRepository repository;
    private final AuditTrail auditTrail;

    public EditorialOperationsService(EditorialOperationsRepository repository, AuditTrail auditTrail) {
        this.repository = repository;
        this.auditTrail = auditTrail;
    }

    public List<EditorialRecommendation> recommendations() {
        return repository.findRecommendations();
    }

    public List<EditorialRecommendationAudit> recommendationAudits(int limit) {
        return repository.findRecommendationAudits(normalizeAuditLimit(limit));
    }

    @Transactional
    public EditorialRecommendation assignRecommendation(long operatorUserId, long bookId, Integer requestedRank) {
        repository.lockOrdering();
        List<EditorialRecommendation> current = repository.lockRecommendations();
        if (current.size() >= EditorialOperationsRepository.MAX_RANK) {
            throw new IllegalStateException("recommendation capacity has been reached");
        }
        if (current.stream().anyMatch(item -> item.book().id() == bookId)) {
            throw new IllegalStateException("book is already assigned to an editorial recommendation");
        }
        Book book = repository.findBookForUpdate(bookId)
                .orElseThrow(() -> new NoSuchElementException("book not found"));
        requirePublished(book);
        int rank = requestedRank == null ? current.size() + 1 : requireRank(requestedRank, current.size() + 1);
        List<EditorialRecommendation> next = new ArrayList<>(current);
        next.add(rank - 1, new EditorialRecommendation(book, rank));
        repository.parkRecommendationRanks(current);
        repository.writeRecommendationRanks(next);
        EditorialRecommendation assigned = recommendationAt(next, bookId);
        repository.recordRecommendationAudit(
                bookId,
                "ASSIGNED",
                null,
                assigned.rank(),
                recommendationDetails(book, assigned.rank(), current.size() + 1),
                operatorUserId);
        auditTrail.record("editorial-recommendation assigned book=" + bookId + " rank=" + assigned.rank()
                + " operator=" + operatorUserId);
        return assigned;
    }

    @Transactional
    public EditorialRecommendation reorderRecommendation(long operatorUserId, long bookId, int requestedRank) {
        repository.lockOrdering();
        List<EditorialRecommendation> current = repository.lockRecommendations();
        EditorialRecommendation target = current.stream()
                .filter(item -> item.book().id() == bookId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("editorial recommendation not found"));
        requirePublished(target.book());
        int rank = requireRank(requestedRank, current.size());
        List<EditorialRecommendation> next = moveRecommendation(current, bookId, rank);
        repository.parkRecommendationRanks(current);
        repository.writeRecommendationRanks(next);
        EditorialRecommendation reordered = recommendationAt(next, bookId);
        repository.recordRecommendationAudit(
                bookId,
                "REORDERED",
                target.rank(),
                reordered.rank(),
                recommendationDetails(target.book(), reordered.rank(), next.size()),
                operatorUserId);
        auditTrail.record("editorial-recommendation reordered book=" + bookId + " from=" + target.rank()
                + " to=" + reordered.rank() + " operator=" + operatorUserId);
        return reordered;
    }

    @Transactional
    public void removeRecommendation(long operatorUserId, long bookId) {
        repository.lockOrdering();
        List<EditorialRecommendation> current = repository.lockRecommendations();
        EditorialRecommendation target = current.stream()
                .filter(item -> item.book().id() == bookId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("editorial recommendation not found"));
        List<EditorialRecommendation> next = current.stream()
                .filter(item -> item.book().id() != bookId)
                .toList();
        repository.parkRecommendationRanks(current);
        repository.clearRecommendationRank(bookId);
        repository.writeRecommendationRanks(next);
        repository.recordRecommendationAudit(
                bookId,
                "REMOVED",
                target.rank(),
                null,
                recommendationDetails(target.book(), target.rank(), current.size()),
                operatorUserId);
        auditTrail.record("editorial-recommendation removed book=" + bookId + " previousRank=" + target.rank()
                + " operator=" + operatorUserId);
    }

    public List<HotSearchTerm> hotSearchTerms() {
        return repository.findHotSearchTerms();
    }

    /** Public callers get the enabled, ranked subset only. */
    public List<HotSearchTerm> publicHotSearchTerms() {
        return repository.findEnabledHotSearchTerms(MAX_PUBLIC_HOT_SEARCH_TERMS);
    }

    public List<HotSearchTermAudit> hotSearchTermAudits(int limit) {
        return repository.findHotSearchTermAudits(normalizeAuditLimit(limit));
    }

    @Transactional
    public HotSearchTerm createHotSearchTerm(
            long operatorUserId,
            String rawTerm,
            boolean enabled,
            Integer requestedRank) {
        NormalizedTerm normalized = normalizeTerm(rawTerm);
        repository.lockOrdering();
        List<HotSearchTerm> current = repository.lockHotSearchTerms();
        if (current.size() >= EditorialOperationsRepository.MAX_RANK) {
            throw new IllegalStateException("hot-search term capacity has been reached");
        }
        int rank = requestedRank == null ? current.size() + 1 : requireRank(requestedRank, current.size() + 1);
        HotSearchTerm created;
        try {
            created = repository.createHotSearchTerm(
                    normalized.key(),
                    normalized.value(),
                    enabled,
                    repository.temporaryRankFor(current.size()),
                    operatorUserId);
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException("hot-search term already exists");
        }
        List<HotSearchTerm> withCreated = new ArrayList<>(current);
        withCreated.add(created);
        List<HotSearchTerm> next = moveHotSearchTerm(withCreated, created.id(), rank);
        repository.parkHotSearchTermRanks(withCreated);
        repository.writeHotSearchTermRanks(next);
        HotSearchTerm saved = hotSearchTermAt(next, created.id(), created);
        repository.recordHotSearchTermAudit(
                saved.id(),
                saved.term(),
                "CREATED",
                null,
                saved.rank(),
                hotSearchDetails(null, saved, current.size() + 1),
                operatorUserId);
        auditTrail.record("hot-search created termId=" + saved.id() + " rank=" + saved.rank()
                + " operator=" + operatorUserId);
        return saved;
    }

    @Transactional
    public HotSearchTerm updateHotSearchTerm(
            long operatorUserId,
            long termId,
            String rawTerm,
            boolean enabled,
            int requestedRank) {
        NormalizedTerm normalized = normalizeTerm(rawTerm);
        repository.lockOrdering();
        List<HotSearchTerm> current = repository.lockHotSearchTerms();
        HotSearchTerm target = current.stream()
                .filter(item -> item.id() == termId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("hot-search term not found"));
        int rank = requireRank(requestedRank, current.size());
        List<HotSearchTerm> next = moveHotSearchTerm(current, termId, rank);
        repository.parkHotSearchTermRanks(current);
        HotSearchTerm detailsSaved;
        try {
            detailsSaved = repository.updateHotSearchTermDetails(
                    termId,
                    normalized.key(),
                    normalized.value(),
                    enabled,
                    operatorUserId);
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException("hot-search term already exists");
        }
        next = replaceHotSearchTerm(next, detailsSaved);
        repository.writeHotSearchTermRanks(next);
        HotSearchTerm saved = hotSearchTermAt(next, termId, detailsSaved);
        repository.recordHotSearchTermAudit(
                saved.id(),
                saved.term(),
                "UPDATED",
                target.rank(),
                saved.rank(),
                hotSearchDetails(target, saved, next.size()),
                operatorUserId);
        auditTrail.record("hot-search updated termId=" + saved.id() + " rank=" + saved.rank()
                + " enabled=" + saved.enabled() + " operator=" + operatorUserId);
        return saved;
    }

    @Transactional
    public void removeHotSearchTerm(long operatorUserId, long termId) {
        repository.lockOrdering();
        List<HotSearchTerm> current = repository.lockHotSearchTerms();
        HotSearchTerm target = current.stream()
                .filter(item -> item.id() == termId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("hot-search term not found"));
        List<HotSearchTerm> next = current.stream().filter(item -> item.id() != termId).toList();
        repository.parkHotSearchTermRanks(current);
        repository.deleteHotSearchTerm(termId);
        repository.writeHotSearchTermRanks(next);
        repository.recordHotSearchTermAudit(
                target.id(),
                target.term(),
                "REMOVED",
                target.rank(),
                null,
                hotSearchDetails(target, null, current.size()),
                operatorUserId);
        auditTrail.record("hot-search removed termId=" + target.id() + " previousRank=" + target.rank()
                + " operator=" + operatorUserId);
    }

    private static List<EditorialRecommendation> moveRecommendation(
            List<EditorialRecommendation> current,
            long bookId,
            int rank) {
        List<EditorialRecommendation> next = new ArrayList<>(current);
        EditorialRecommendation target = next.stream()
                .filter(item -> item.book().id() == bookId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("editorial recommendation not found"));
        next.remove(target);
        next.add(rank - 1, target);
        return reRankRecommendations(next);
    }

    private static List<EditorialRecommendation> reRankRecommendations(List<EditorialRecommendation> items) {
        List<EditorialRecommendation> ranked = new ArrayList<>(items.size());
        for (int index = 0; index < items.size(); index++) {
            ranked.add(new EditorialRecommendation(items.get(index).book(), index + 1));
        }
        return ranked;
    }

    private static EditorialRecommendation recommendationAt(List<EditorialRecommendation> items, long bookId) {
        return items.stream()
                .filter(item -> item.book().id() == bookId)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("recommendation order was not saved"));
    }

    private static List<HotSearchTerm> moveHotSearchTerm(List<HotSearchTerm> current, long termId, int rank) {
        List<HotSearchTerm> next = new ArrayList<>(current);
        HotSearchTerm target = next.stream()
                .filter(item -> item.id() == termId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("hot-search term not found"));
        next.remove(target);
        next.add(rank - 1, target);
        return reRankHotSearchTerms(next);
    }

    private static List<HotSearchTerm> replaceHotSearchTerm(List<HotSearchTerm> current, HotSearchTerm replacement) {
        List<HotSearchTerm> next = new ArrayList<>(current.size());
        for (HotSearchTerm item : current) {
            next.add(item.id() == replacement.id() ? replacement : item);
        }
        return reRankHotSearchTerms(next);
    }

    private static List<HotSearchTerm> reRankHotSearchTerms(List<HotSearchTerm> items) {
        List<HotSearchTerm> ranked = new ArrayList<>(items.size());
        for (int index = 0; index < items.size(); index++) {
            HotSearchTerm item = items.get(index);
            ranked.add(new HotSearchTerm(
                    item.id(),
                    item.term(),
                    item.enabled(),
                    index + 1,
                    item.createdByUserId(),
                    item.updatedByUserId(),
                    item.createdAt(),
                    item.updatedAt()));
        }
        return ranked;
    }

    private static HotSearchTerm hotSearchTermAt(
            List<HotSearchTerm> items,
            long termId,
            HotSearchTerm fallback) {
        return items.stream().filter(item -> item.id() == termId).findFirst().orElse(fallback);
    }

    private static void requirePublished(Book book) {
        if (book.status() != BookStatus.PUBLISHED) {
            throw new IllegalStateException("only published books can be assigned or reordered as recommendations");
        }
    }

    private static int requireRank(int rank, int upperBound) {
        if (rank < 1 || rank > upperBound || rank > EditorialOperationsRepository.MAX_RANK) {
            throw badRequest("rank must be between 1 and " + upperBound);
        }
        return rank;
    }

    private static int normalizeAuditLimit(int limit) {
        return Math.max(1, Math.min(limit, 100));
    }

    private static NormalizedTerm normalizeTerm(String rawTerm) {
        if (rawTerm == null) {
            throw badRequest("hot-search term is required");
        }
        String value = rawTerm.trim().replaceAll("\\s+", " ");
        if (value.isEmpty()) {
            throw badRequest("hot-search term is required");
        }
        if (value.length() > MAX_TERM_LENGTH) {
            throw badRequest("hot-search term is too long");
        }
        return new NormalizedTerm(value, value.toLowerCase(Locale.ROOT));
    }

    private static String recommendationDetails(Book book, int rank, int placementCount) {
        return "title=" + book.title() + " status=" + book.status().name() + " rank=" + rank
                + " placementCount=" + placementCount;
    }

    private static String hotSearchDetails(HotSearchTerm previous, HotSearchTerm current, int termCount) {
        return "previousTerm=" + (previous == null ? "" : previous.term())
                + " previousEnabled=" + (previous == null ? "" : previous.enabled())
                + " previousRank=" + (previous == null ? "" : previous.rank())
                + " term=" + (current == null ? "" : current.term())
                + " enabled=" + (current == null ? "" : current.enabled())
                + " rank=" + (current == null ? "" : current.rank())
                + " termCount=" + termCount;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private record NormalizedTerm(String value, String key) {}
}
