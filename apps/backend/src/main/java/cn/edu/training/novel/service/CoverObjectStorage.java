package cn.edu.training.novel.service;

/**
 * A deliberately narrow storage boundary for author covers. Implementations may delete only URLs
 * they generated themselves; arbitrary historic or external cover values are never treated as keys.
 */
public interface CoverObjectStorage {
    StoredCover store(CoverImage image);
    void deleteManaged(String publicUrl);
    boolean isManaged(String publicUrl);

    record StoredCover(String publicUrl, String objectKey) { }
}
