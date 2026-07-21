package cn.edu.training.novel.domain;

/** Immutable human decision attached to current model or local moderation evidence. */
public enum ModerationReviewDecision {
    APPROVED,
    REJECTED;

    public static ModerationReviewDecision fromApproval(boolean approved) {
        return approved ? APPROVED : REJECTED;
    }
}
