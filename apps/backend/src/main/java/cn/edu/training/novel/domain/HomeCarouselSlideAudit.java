package cn.edu.training.novel.domain;

import java.time.Instant;

public record HomeCarouselSlideAudit(
        long id,
        long slideId,
        long bookId,
        String action,
        String details,
        Long operatorUserId,
        Instant createdAt) { }
