package cn.edu.training.novel.domain;

import java.time.Instant;

public record OperatingTaxonomyAudit(
        long id,
        long taxonomyId,
        String type,
        String action,
        String details,
        long operatorUserId,
        Instant createdAt) {}
