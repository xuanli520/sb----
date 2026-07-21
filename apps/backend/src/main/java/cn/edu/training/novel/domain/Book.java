package cn.edu.training.novel.domain;

/** A catalog work, including its server-owned whole-book purchase price in tokens. */
public record Book(
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
        long purchasePrice) {
    public static final long DEFAULT_PURCHASE_PRICE = 30L;

    public Book {
        if (purchasePrice <= 0) {
            throw new IllegalArgumentException("purchase price must be positive");
        }
    }

    /** Compatibility constructor for call sites and fixtures created before server-side pricing. */
    public Book(
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
            long heat) {
        this(
                id,
                title,
                author,
                category,
                words,
                serialStatus,
                synopsis,
                cover,
                status,
                authorId,
                heat,
                DEFAULT_PURCHASE_PRICE);
    }
}
