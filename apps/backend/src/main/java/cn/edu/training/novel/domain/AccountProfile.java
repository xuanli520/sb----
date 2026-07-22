package cn.edu.training.novel.domain;

import java.util.Set;

/** The current account's durable profile fields that are safe to expose to its own session. */
public record AccountProfile(long id, String name, Set<Role> roles, boolean passwordChangeRequired) {}
