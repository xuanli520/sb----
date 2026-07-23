package cn.edu.training.novel.domain;

/** A durable candidate is never readable until it has been applied to a live chapter. */
public enum ChapterCandidateStatus {
    PENDING_REVIEW,
    APPROVED,
    REJECTED
}
