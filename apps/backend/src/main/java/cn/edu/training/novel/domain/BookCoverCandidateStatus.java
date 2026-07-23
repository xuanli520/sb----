package cn.edu.training.novel.domain;

/** Private cover replacement lifecycle for an already published work. */
public enum BookCoverCandidateStatus {
    PENDING_REVIEW,
    APPROVED,
    REJECTED,
    SUPERSEDED
}
