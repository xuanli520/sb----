package cn.edu.training.novel.domain;

import java.time.Instant;
import java.util.UUID;

public record MediaAssetAudit(
        long id,
        UUID assetId,
        String action,
        String details,
        Long operatorUserId,
        Instant createdAt) { }
