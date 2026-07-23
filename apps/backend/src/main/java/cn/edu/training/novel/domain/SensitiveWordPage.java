package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Bounded administrator vocabulary result. */
public record SensitiveWordPage(List<SensitiveWord> items, PageMeta meta) {
    public SensitiveWordPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
