package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Bounded immutable whole-work moderation snapshot history. */
public record BookModerationSnapshotPage(List<BookModerationSnapshot> items, PageMeta meta) {
    public BookModerationSnapshotPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
