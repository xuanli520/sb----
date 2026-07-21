package cn.edu.training.novel.service;

/** A narrow boundary around the external model provider, designed for deterministic replacement in tests. */
public interface ContentModelModerationClient {
    ModelModerationResult moderate(ContentModerationRequest request);
}
