package cn.edu.training.novel.domain;

import java.time.Instant;

/** Immutable before/after snapshot of one commercial-rule administration decision. */
public record CommercialRuleAudit(
        long id,
        CommercialRules previousRules,
        CommercialRules updatedRules,
        String reason,
        long operatorUserId,
        Instant createdAt) {}
