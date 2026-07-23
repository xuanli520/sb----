package cn.edu.training.novel.domain;

import java.time.Instant;
import java.util.UUID;

/** Metadata and lifecycle state for an immutable managed media object. */
public record MediaAsset(
        UUID id,
        MediaAssetOwnerScope ownerScope,
        Long ownerUserId,
        MediaAssetPurpose purpose,
        String objectKey,
        String publicUrl,
        String sha256,
        String contentType,
        int width,
        int height,
        long byteSize,
        String label,
        MediaAssetState state,
        Instant createdAt,
        Instant updatedAt,
        Instant archivedAt,
        Instant deletedAt) { }
