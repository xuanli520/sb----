package cn.edu.training.novel.domain;

/** Normalized decision persisted for every local or model moderation attempt. */
public enum ModerationDecision {
    PASS,
    MANUAL_REVIEW,
    REJECT,
    LOCAL_SENSITIVE_WORD,
    MODEL_UNAVAILABLE,
    MODEL_ERROR,
    INVALID_OUTPUT,
    SIMULATED_PASS;

    /** Only a bounded automatic screen may release an individual chapter. */
    public boolean permitsAutomaticChapterPublication() {
        return this == PASS || this == SIMULATED_PASS;
    }
}
