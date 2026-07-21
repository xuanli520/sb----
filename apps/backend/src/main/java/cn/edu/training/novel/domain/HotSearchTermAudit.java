package cn.edu.training.novel.domain;

import java.time.Instant;

/** Immutable evidence for the create, update, or removal of one hot-search term. */
public record HotSearchTermAudit(
        long id,
        long termId,
        String term,
        String action,
        Integer previousRank,
        Integer rank,
        String details,
        long operatorUserId,
        Instant createdAt) {}
