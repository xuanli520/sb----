package cn.edu.training.novel.domain;

import java.time.Instant;

/** The durable author identity created when an author application is approved. */
public record AuthorProfile(
        long userId,
        String penName,
        long approvedApplicationId,
        Instant approvedAt) { }
