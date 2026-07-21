package cn.edu.training.novel.domain;

/** Aggregate for all records matching an author reward-report query, not just the current page. */
public record AuthorRewardSummary(long rewardCount, long totalTokens, String amountUnit) {
    public static final String TOKEN = "TOKEN";

    public AuthorRewardSummary {
        if (rewardCount < 0 || totalTokens < 0) {
            throw new IllegalArgumentException("reward summary cannot be negative");
        }
        if (!TOKEN.equals(amountUnit)) {
            throw new IllegalArgumentException("reward summary must use token units");
        }
    }
}
