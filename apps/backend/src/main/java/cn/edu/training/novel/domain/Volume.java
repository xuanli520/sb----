package cn.edu.training.novel.domain;

import java.time.Instant;

/** A book-owned, ordered grouping of chapters. */
public record Volume(long id, long bookId, String title, int orderNo, Instant createdAt) {}
