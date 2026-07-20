package cn.edu.training.novel.domain;

import java.time.Instant;

public record ReadingProgress(long bookId, long chapterId, int offset, Instant updatedAt) { }
