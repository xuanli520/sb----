package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Zero-based page of chapters for one author-owned book. */
public record AuthorWorkspaceChapterPage(List<AuthorWorkspaceChapter> items, PageMeta meta) {
    public AuthorWorkspaceChapterPage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
