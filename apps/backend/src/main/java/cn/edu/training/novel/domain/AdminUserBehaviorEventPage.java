package cn.edu.training.novel.domain;

import java.util.List;

/** A bounded, stable-order page of redacted account behavior events. */
public record AdminUserBehaviorEventPage(List<AdminUserBehaviorEvent> items, long total, int page, int size) {}
