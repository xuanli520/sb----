package cn.edu.training.novel.domain;

import java.util.List;
import java.util.Objects;

/** Zero-based page of author-owned volumes. */
public record AuthorWorkspaceVolumePage(List<AuthorWorkspaceVolume> items, PageMeta meta) {
    public AuthorWorkspaceVolumePage {
        items = List.copyOf(items);
        Objects.requireNonNull(meta, "meta");
    }
}
