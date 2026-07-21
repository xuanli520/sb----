package cn.edu.training.novel.domain;

import java.util.List;

/** Stable page envelope for administrative redemption-code queries. */
public record RedemptionCodePage(List<ManagedRedemptionCode> items, int page, int size, long total) {}
