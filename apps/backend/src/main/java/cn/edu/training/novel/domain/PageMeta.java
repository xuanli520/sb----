package cn.edu.training.novel.domain;

/** Common zero-based page metadata for bounded API list responses. */
public record PageMeta(long total, int page, int size) {
    public PageMeta {
        if (total < 0) {
            throw new IllegalArgumentException("total must be non-negative");
        }
        if (page < 0) {
            throw new IllegalArgumentException("page must be non-negative");
        }
        if (size < 1) {
            throw new IllegalArgumentException("size must be positive");
        }
    }
}
