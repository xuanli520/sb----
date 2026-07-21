package cn.edu.training.novel.domain;

import java.time.Instant;
import java.util.Set;

/** A deliberately credential-free account projection for the operations console. */
public record AdminAccount(
        long id,
        String loginName,
        String displayName,
        Set<Role> roles,
        boolean enabled,
        Instant createdAt,
        Instant updatedAt) {}
