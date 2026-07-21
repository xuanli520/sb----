package cn.edu.training.novel.domain;

import java.time.Instant;

/** Operations-owned search phrase shown to readers only while enabled. */
public record HotSearchTerm(
        long id,
        String term,
        boolean enabled,
        int rank,
        Long createdByUserId,
        Long updatedByUserId,
        Instant createdAt,
        Instant updatedAt) {}
