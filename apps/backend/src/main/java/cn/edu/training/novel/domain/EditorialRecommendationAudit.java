package cn.edu.training.novel.domain;

import java.time.Instant;

/** Immutable evidence for a recommendation placement decision. */
public record EditorialRecommendationAudit(
        long id,
        long bookId,
        String action,
        Integer previousRank,
        Integer rank,
        String details,
        long operatorUserId,
        Instant createdAt) {}
