package cn.edu.training.novel.domain;

import java.time.Instant;

public record Bookmark(long id, long bookId, long chapterId, int offset, String note, Instant createdAt) { }
