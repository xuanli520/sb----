package cn.edu.training.novel.domain;

/** Explicit manual outcome for a record stranded in the retired NEEDS_REVIEW status. */
public enum LegacyReviewTriageAction {
    REQUEUE_FOR_REVIEW,
    REJECT
}
