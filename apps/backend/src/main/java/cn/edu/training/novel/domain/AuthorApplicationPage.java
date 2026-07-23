package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Bounded administrator review queue for pending author applications. */
public record AuthorApplicationPage(List<AuthorApplication> items, PageMeta meta) {
    public AuthorApplicationPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
