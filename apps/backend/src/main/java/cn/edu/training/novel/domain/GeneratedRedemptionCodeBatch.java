package cn.edu.training.novel.domain;

import java.util.List;

/** Codes are returned once at creation time so the operator can distribute them securely. */
public record GeneratedRedemptionCodeBatch(String batchNo, List<ManagedRedemptionCode> codes) {}
