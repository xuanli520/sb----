package cn.edu.training.novel.domain;

import java.time.Instant;

/** Administrative projection of a one-time redemption asset. */
public record ManagedRedemptionCode(
        String code,
        String batchNo,
        String benefitType,
        long tokenAmount,
        Long bookId,
        int membershipDays,
        String status,
        Instant expiresAt,
        Long redeemedByUserId,
        Instant redeemedAt,
        Long createdByUserId,
        Instant createdAt,
        Long disabledByUserId,
        Instant disabledAt) {
    public ManagedRedemptionCode withStatus(String effectiveStatus) {
        return new ManagedRedemptionCode(
                code,
                batchNo,
                benefitType,
                tokenAmount,
                bookId,
                membershipDays,
                effectiveStatus,
                expiresAt,
                redeemedByUserId,
                redeemedAt,
                createdByUserId,
                createdAt,
                disabledByUserId,
                disabledAt);
    }
}
