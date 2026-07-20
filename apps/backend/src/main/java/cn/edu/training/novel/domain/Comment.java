package cn.edu.training.novel.domain;

import java.time.Instant;

public record Comment(long id, long bookId, Long chapterId, long userId, String authorName, String content,
                      String status, Instant createdAt) { }
