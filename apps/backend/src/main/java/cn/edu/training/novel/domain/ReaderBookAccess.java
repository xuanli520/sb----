package cn.edu.training.novel.domain;

/**
 * Server-derived access result for one published work.  The source is intentionally descriptive
 * rather than a client supplied role or price so reader clients can present the correct state
 * without treating a hidden chapter body as a feature flag.
 */
public record ReaderBookAccess(boolean fullBookAccess, String source) {}
