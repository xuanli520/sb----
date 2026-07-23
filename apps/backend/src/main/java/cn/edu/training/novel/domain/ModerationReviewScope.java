package cn.edu.training.novel.domain;

/** Distinguishes a first publication decision from an incremental content decision. */
public enum ModerationReviewScope {
    WHOLE_BOOK,
    NEW_CHAPTER,
    CHAPTER_REVISION
}
