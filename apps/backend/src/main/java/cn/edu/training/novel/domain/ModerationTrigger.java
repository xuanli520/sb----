package cn.edu.training.novel.domain;

/** The lifecycle transition that requested automatic content screening. */
public enum ModerationTrigger {
    CHAPTER_SUBMISSION,
    SCHEDULED_PUBLICATION,
    PUBLISHED_CHAPTER_REVISION
}
