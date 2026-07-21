package cn.edu.training.novel.config;

/**
 * Explicit deployment mode for safety-sensitive runtime behavior. This deliberately does not
 * infer authorization from a Spring profile name.
 */
public enum NovelRuntimeMode {
    PRODUCTION,
    DEVELOPMENT,
    TEST;

    public boolean allowsDevelopmentSimulation() {
        return this == DEVELOPMENT || this == TEST;
    }
}
