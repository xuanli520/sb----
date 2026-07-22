package cn.edu.training.novel.domain;

/** Outcome of removing a volume while retaining its chapters as ungrouped work. */
public record VolumeDeleteResult(long id, boolean deleted, int detachedChapterCount) {}
