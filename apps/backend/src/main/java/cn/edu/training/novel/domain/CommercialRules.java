package cn.edu.training.novel.domain;

import java.time.Instant;

/** Active platform-wide limits applied to membership-code issuance and reader interactions. */
public record CommercialRules(
        int membershipDaysMaximumPerCode,
        int recommendationVotesPerDay,
        int monthlyVotesPerMonth,
        int rewardMinimumTokens,
        int rewardMaximumTokensPerReward,
        int rewardMaximumTokensPerDay,
        Instant updatedAt) {

    public int voteLimit(String voteType) {
        return switch (voteType) {
            case "recommendation" -> recommendationVotesPerDay;
            case "monthly" -> monthlyVotesPerMonth;
            default -> throw new IllegalArgumentException("unsupported vote type");
        };
    }
}
