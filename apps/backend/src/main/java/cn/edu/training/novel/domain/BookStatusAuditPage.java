package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Paginated immutable history of availability decisions for one work. */
public record BookStatusAuditPage(List<BookStatusAudit> items, PageMeta meta) {
    public BookStatusAuditPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
