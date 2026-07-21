package cn.edu.training.novel.domain;

import java.time.Instant;
import java.util.List;

/** Current-user entitlement state. Amounts are token units, never a payment or revenue claim. */
public record AccountEntitlements(Membership membership, List<Book> books) {
    public record Membership(Instant expiresAt, boolean active) {}

    public record Book(
            long bookId,
            String bookTitle,
            String sourceType,
            String sourceReference,
            long purchaseAmount,
            String amountUnit,
            Instant acquiredAt) {}
}
