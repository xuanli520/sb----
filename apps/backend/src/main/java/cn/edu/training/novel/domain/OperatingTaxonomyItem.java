package cn.edu.training.novel.domain;

import java.time.Instant;

public record OperatingTaxonomyItem(
        long id,
        String type,
        String name,
        boolean enabled,
        int sortOrder,
        Long createdByUserId,
        Long updatedByUserId,
        Instant createdAt,
        Instant updatedAt) {}
