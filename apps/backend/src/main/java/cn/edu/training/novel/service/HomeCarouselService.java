package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookPresentation;
import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.HomeCarouselSlide;
import cn.edu.training.novel.domain.HomeCarouselSlideAudit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Independent stationmaster-managed carousel. It intentionally has no dependency on editorial rank. */
@Service
public class HomeCarouselService {
    private static final int MAX_ENABLED_SLIDES = 3;
    private static final int MAX_AUDIT_LIMIT = 100;

    private final MediaCarouselRepository repository;
    private final MediaAssetService mediaAssets;
    private final BookPresentationService presentations;
    private final AuditTrail auditTrail;

    public HomeCarouselService(
            MediaCarouselRepository repository,
            MediaAssetService mediaAssets,
            BookPresentationService presentations,
            AuditTrail auditTrail) {
        this.repository = repository;
        this.mediaAssets = mediaAssets;
        this.presentations = presentations;
        this.auditTrail = auditTrail;
    }

    @Transactional(readOnly = true)
    public List<HomeCarouselSlide> slides() {
        return present(repository.findCarouselSlides());
    }

    @Transactional(readOnly = true)
    public List<HomeCarouselSlide> publicSlides() {
        return present(repository.findPublicCarouselSlides(MAX_ENABLED_SLIDES));
    }

    @Transactional(readOnly = true)
    public List<HomeCarouselSlideAudit> audits(int limit) {
        return repository.findCarouselAudits(Math.max(1, Math.min(limit, MAX_AUDIT_LIMIT)));
    }

    @Transactional
    public HomeCarouselSlide create(long administratorUserId, CreateCommand command) {
        repository.lockCarouselOrdering();
        List<MediaCarouselRepository.CarouselRow> current = repository.lockCarouselRows();
        if (current.stream().anyMatch(slide -> slide.bookId() == command.bookId())) {
            throw new IllegalStateException("book already has a home carousel slide");
        }
        requirePublished(command.bookId());
        requireEnabledCapacity(current, command.enabled(), null);
        UUID bannerAssetId = command.bannerAssetId();
        if (bannerAssetId != null) mediaAssets.requireActivePlatformBannerForBinding(bannerAssetId);
        int rank = requiredRank(command.rank(), current.size() + 1);
        MediaCarouselRepository.CarouselRow created = repository.createCarouselRow(
                command.bookId(),
                normalizeOptional(command.headline(), 255, "carousel headline"),
                normalizeOptional(command.copy(), 1024, "carousel copy"),
                command.enabled(),
                MediaCarouselRepository.temporaryRank(current.size()),
                administratorUserId);
        List<MediaCarouselRepository.CarouselRow> ordered = new ArrayList<>(current);
        ordered.add(rank - 1, created);
        repository.parkCarouselRanks(current);
        repository.writeCarouselRanks(ordered, administratorUserId);
        mediaAssets.replaceCarouselBannerBinding(administratorUserId, created.id(), bannerAssetId);
        repository.recordCarouselAudit(
                created.id(), command.bookId(), "CREATED", carouselDetails(created.id(), rank, command.enabled()), administratorUserId);
        auditTrail.record("home carousel created slide=" + created.id() + " book=" + command.bookId() + " operator=" + administratorUserId);
        return requireSlide(created.id());
    }

    @Transactional
    public HomeCarouselSlide update(long administratorUserId, long slideId, UpdateCommand command) {
        repository.lockCarouselOrdering();
        List<MediaCarouselRepository.CarouselRow> current = repository.lockCarouselRows();
        MediaCarouselRepository.CarouselRow existing = current.stream()
                .filter(slide -> slide.id() == slideId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("home carousel slide not found"));
        if (existing.version() != command.version()) {
            throw new IllegalStateException("home carousel slide changed by another operator");
        }
        if (existing.bookId() != command.bookId()
                && current.stream().anyMatch(slide -> slide.id() != slideId && slide.bookId() == command.bookId())) {
            throw new IllegalStateException("book already has a home carousel slide");
        }
        requirePublished(command.bookId());
        requireEnabledCapacity(current, command.enabled(), slideId);
        if (command.bannerAssetId() != null) mediaAssets.requireActivePlatformBannerForBinding(command.bannerAssetId());
        int rank = requiredRank(command.rank(), current.size());
        String headline = normalizeOptional(command.headline(), 255, "carousel headline");
        String copy = normalizeOptional(command.copy(), 1024, "carousel copy");
        repository.updateCarouselRow(
                slideId,
                command.bookId(),
                headline,
                copy,
                command.enabled(),
                command.version(),
                administratorUserId);
        mediaAssets.replaceCarouselBannerBinding(administratorUserId, slideId, command.bannerAssetId());
        List<MediaCarouselRepository.CarouselRow> ordered = move(current, slideId, rank);
        repository.parkCarouselRanks(current);
        repository.writeCarouselRanks(ordered, administratorUserId);
        String action = existing.rank() == rank ? "UPDATED" : "REORDERED";
        repository.recordCarouselAudit(
                slideId,
                command.bookId(),
                action,
                carouselDetails(slideId, rank, command.enabled()),
                administratorUserId);
        auditTrail.record("home carousel " + action.toLowerCase() + " slide=" + slideId + " operator=" + administratorUserId);
        return requireSlide(slideId);
    }

    @Transactional
    public void remove(long administratorUserId, long slideId, long version) {
        repository.lockCarouselOrdering();
        List<MediaCarouselRepository.CarouselRow> current = repository.lockCarouselRows();
        MediaCarouselRepository.CarouselRow existing = current.stream()
                .filter(slide -> slide.id() == slideId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("home carousel slide not found"));
        if (existing.version() != version) throw new IllegalStateException("home carousel slide changed by another operator");
        List<MediaCarouselRepository.CarouselRow> ordered = current.stream().filter(slide -> slide.id() != slideId).toList();
        mediaAssets.removeCarouselBannerBinding(administratorUserId, slideId);
        repository.parkCarouselRanks(current);
        repository.deleteCarouselRow(slideId, version);
        repository.writeCarouselRanks(ordered, administratorUserId);
        repository.recordCarouselAudit(slideId, existing.bookId(), "REMOVED", "slide removed", administratorUserId);
        auditTrail.record("home carousel removed slide=" + slideId + " operator=" + administratorUserId);
    }

    /** Keeps the status transition invariant even if an old slide is still present in the table. */
    @Transactional
    public void disableSlidesForBook(long bookId, Long operatorUserId, String reason) {
        repository.lockCarouselOrdering();
        for (MediaCarouselRepository.CarouselRow slide : repository.disableCarouselRowsForBook(bookId)) {
            repository.setCarouselRowEnabled(slide.id(), false, operatorUserId == null ? 0L : operatorUserId);
            repository.recordCarouselAudit(
                    slide.id(),
                    bookId,
                    "AUTO_DISABLED",
                    normalizeReason(reason),
                    operatorUserId);
            auditTrail.record("home carousel auto-disabled slide=" + slide.id() + " book=" + bookId);
        }
    }

    private HomeCarouselSlide requireSlide(long slideId) {
        return present(repository.findCarouselSlides()).stream()
                .filter(slide -> slide.slideId() == slideId)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("home carousel slide was not saved"));
    }

    private void requirePublished(long bookId) {
        Book book = repository.findBookForUpdate(bookId).orElseThrow(() -> new NoSuchElementException("book not found"));
        if (book.status() != BookStatus.PUBLISHED) {
            throw new IllegalStateException("only published books can be used in the home carousel");
        }
    }

    private static void requireEnabledCapacity(
            List<MediaCarouselRepository.CarouselRow> current,
            boolean enabled,
            Long replacedSlideId) {
        if (!enabled) return;
        long otherEnabled = current.stream()
                .filter(slide -> replacedSlideId == null || slide.id() != replacedSlideId)
                .filter(MediaCarouselRepository.CarouselRow::enabled)
                .count();
        if (otherEnabled >= MAX_ENABLED_SLIDES) {
            throw new IllegalStateException("at most three home carousel slides can be enabled");
        }
    }

    private static int requiredRank(Integer rank, int size) {
        if (rank == null) return size;
        if (rank < 1 || rank > size) throw new IllegalArgumentException("home carousel rank is out of range");
        return rank;
    }

    private static List<MediaCarouselRepository.CarouselRow> move(
            List<MediaCarouselRepository.CarouselRow> current,
            long slideId,
            int rank) {
        List<MediaCarouselRepository.CarouselRow> moved = new ArrayList<>(current);
        MediaCarouselRepository.CarouselRow target = moved.stream()
                .filter(slide -> slide.id() == slideId)
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("home carousel slide not found"));
        moved.remove(target);
        moved.add(rank - 1, target);
        return moved;
    }

    private static String normalizeOptional(String value, int maximum, String label) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.length() > maximum) throw new IllegalArgumentException(label + " is too long");
        return normalized;
    }

    private static String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) return "book is no longer publicly available";
        return reason.length() <= 1024 ? reason : reason.substring(0, 1024);
    }

    private static String carouselDetails(long slideId, int rank, boolean enabled) {
        return "slide=" + slideId + " rank=" + rank + " enabled=" + enabled;
    }

    private List<HomeCarouselSlide> present(List<MediaCarouselRepository.CarouselSlideData> source) {
        List<BookPresentation> books = presentations.present(source.stream().map(MediaCarouselRepository.CarouselSlideData::book).toList());
        java.util.Map<Long, BookPresentation> byBookId = new HashMap<>();
        for (BookPresentation book : books) byBookId.put(book.id(), book);
        return source.stream().map(slide -> new HomeCarouselSlide(
                slide.slideId(),
                byBookId.get(slide.book().id()),
                slide.bannerAssetId(),
                slide.bannerUrl(),
                slide.headline(),
                slide.copy(),
                slide.enabled(),
                slide.rank(),
                slide.version(),
                slide.createdAt(),
                slide.updatedAt())).toList();
    }

    public record CreateCommand(
            long bookId,
            UUID bannerAssetId,
            String headline,
            String copy,
            boolean enabled,
            Integer rank) { }

    public record UpdateCommand(
            long bookId,
            UUID bannerAssetId,
            String headline,
            String copy,
            boolean enabled,
            int rank,
            long version) { }
}
