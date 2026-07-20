package cn.edu.training.novel.domain;

import java.time.Instant;

public record AuthorApplication(long id, long userId, String penName, String statement, String status, String reason, Instant createdAt) { }
