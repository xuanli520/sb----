package cn.edu.training.novel.domain;

/** Lifecycle of one immutable, whole-work moderation snapshot. */
public enum BookModerationSnapshotStatus {
    QUEUED,
    PROCESSING,
    COMPLETED,
    STALE;

    public boolean isTerminal() {
        return this == COMPLETED || this == STALE;
    }
}
