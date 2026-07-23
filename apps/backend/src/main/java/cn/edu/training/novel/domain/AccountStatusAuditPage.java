package cn.edu.training.novel.domain;

import java.util.List;

/** Stable, count-aware page of immutable account status decisions. */
public record AccountStatusAuditPage(List<AccountStatusAudit> items, long total, int page, int size) {}
