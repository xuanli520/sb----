package cn.edu.training.novel.domain;

import java.time.Instant;
import java.util.UUID;

/** A current reference from a product surface to an asset. */
public record MediaAssetBinding(
        long id,
        UUID assetId,
        MediaAssetPurpose bindingType,
        long targetId,
        Long createdByUserId,
        Instant createdAt) { }
