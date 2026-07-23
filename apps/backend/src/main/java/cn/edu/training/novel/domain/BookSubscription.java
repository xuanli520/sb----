package cn.edu.training.novel.domain;

import java.time.Instant;

/** Current free-follow state for one reader and work. */
public record BookSubscription(long bookId, boolean subscribed, Instant subscribedAt) {}
