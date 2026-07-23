package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** A stable zero-based page envelope for book-listing APIs. */
public record BookPresentationPage(List<BookPresentation> items, PageMeta meta) {
    public BookPresentationPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
