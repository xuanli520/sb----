package cn.edu.training.novel.domain;

import java.time.Instant;
import java.util.UUID;

/** A private staged cover that cannot replace a public cover until a stationmaster approves it. */
public record BookCoverCandidate(
        long id,
        long bookId,
        UUID assetId,
        UUID approvedAssetId,
        BookCoverCandidateStatus status,
        String reviewReason,
        long createdByUserId,
        Instant createdAt,
        Long reviewedByUserId,
        Instant reviewedAt) { }
