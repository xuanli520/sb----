package cn.edu.training.novel.domain;

/** The API tells the operator whether a requested state was already in effect. */
public record AccountStatusChange(
        long userId,
        boolean enabled,
        AdminAccount account,
        boolean changed,
        AccountStatusAudit audit) {}
