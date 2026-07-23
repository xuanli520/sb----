package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookPresentation;
import cn.edu.training.novel.domain.InteractionStats;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Batched interaction projection shared by all catalog-facing read surfaces. */
@Service
@Transactional(readOnly = true)
public class BookPresentationService {
    private static final InteractionStats EMPTY_METRICS = new InteractionStats(0, 0, 0, 0, 0);
    private final InteractionRepository interactionRepository;
    private final MediaCarouselRepository mediaRepository;

    public BookPresentationService(
            InteractionRepository interactionRepository,
            MediaCarouselRepository mediaRepository) {
        this.interactionRepository = interactionRepository;
        this.mediaRepository = mediaRepository;
    }

    public BookPresentation present(Book book) {
        return present(List.of(book)).getFirst();
    }

    /**
     * Retains a legacy {@link Book} response shape while resolving its cover through the binding
     * registry. The pre-media catalog column is deliberately never a fallback.
     */
    public Book resolveCover(Book book) {
        return resolveCovers(List.of(book)).getFirst();
    }

    public List<Book> resolveCovers(List<Book> books) {
        Map<Long, String> coverUrls = mediaRepository.findActiveBookCoverUrls(
                books.stream().map(Book::id).toList());
        return books.stream()
                .map(book -> copyWithCover(book, coverUrls.get(book.id())))
                .toList();
    }

    public List<BookPresentation> present(List<Book> books) {
        Map<Long, InteractionStats> metrics = interactionRepository.statsByBookIds(
                books.stream().map(Book::id).toList());
        Map<Long, String> coverUrls = mediaRepository.findActiveBookCoverUrls(
                books.stream().map(Book::id).toList());
        return books.stream()
                .map(book -> BookPresentation.from(
                        book,
                        metrics.getOrDefault(book.id(), EMPTY_METRICS),
                        coverUrls.get(book.id())))
                .toList();
    }

    private static Book copyWithCover(Book book, String cover) {
        return new Book(
                book.id(),
                book.title(),
                book.author(),
                book.category(),
                book.words(),
                book.serialStatus(),
                book.synopsis(),
                cover,
                book.status(),
                book.authorId(),
                book.heat(),
                book.purchasePrice());
    }
}
