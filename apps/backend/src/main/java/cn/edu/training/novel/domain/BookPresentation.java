package cn.edu.training.novel.domain;

/**
 * Read-only catalog projection. The write-side {@link Book} remains intentionally free of
 * counters that are maintained by the interaction subsystem.
 */
public record BookPresentation(
        long id,
        String title,
        String author,
        String category,
        int words,
        String serialStatus,
        String synopsis,
        String cover,
        BookStatus status,
        long authorId,
        long heat,
        long purchasePrice,
        InteractionStats metrics) {

    public static BookPresentation from(Book book, InteractionStats metrics) {
        return from(book, metrics, null);
    }

    public static BookPresentation from(Book book, InteractionStats metrics, String resolvedCover) {
        return new BookPresentation(
                book.id(),
                book.title(),
                book.author(),
                book.category(),
                book.words(),
                book.serialStatus(),
                book.synopsis(),
                resolvedCover,
                book.status(),
                book.authorId(),
                book.heat(),
                book.purchasePrice(),
                metrics);
    }
}
