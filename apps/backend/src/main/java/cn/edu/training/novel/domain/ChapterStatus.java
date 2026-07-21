package cn.edu.training.novel.domain;

/** Lifecycle state for a chapter independent from its parent book review state. */
public enum ChapterStatus {
    DRAFT,
    SCHEDULED,
    PUBLISHED,
    NEEDS_REVIEW
}
