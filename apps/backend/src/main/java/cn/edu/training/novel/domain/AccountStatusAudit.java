package cn.edu.training.novel.domain;

import java.time.Instant;

public record AccountStatusAudit(
        long id,
        long accountId,
        boolean previousEnabled,
        boolean enabled,
        String reason,
        long operatorUserId,
        Instant createdAt) {}
