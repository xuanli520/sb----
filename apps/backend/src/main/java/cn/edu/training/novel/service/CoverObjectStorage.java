package cn.edu.training.novel.service;

import java.io.InputStream;

/**
 * A deliberately narrow storage boundary for author covers. Implementations may delete only URLs
 * they generated themselves; arbitrary historic or external cover values are never treated as keys.
 */
public interface CoverObjectStorage {
    StoredCover store(CoverImage image);

    /** Private author-owned cover proposal; it must not be reachable through `/media`. */
    default StoredStagedCover storeStagingCover(CoverImage image) {
        throw new CoverStorageUnavailableException("cover candidate storage is unavailable");
    }

    /** Copies a verified staging object into a new immutable public cover object. */
    default StoredCover promoteStagingCover(String stagingObjectKey) {
        throw new CoverStorageUnavailableException("cover candidate storage is unavailable");
    }

    /** Platform-only banner writes use the same server-side object store but a different prefix. */
    default StoredCover storeBanner(CoverImage image) {
        throw new CoverStorageUnavailableException("banner upload storage is unavailable");
    }
    void deleteManaged(String publicUrl);
    boolean isManaged(String publicUrl);
    /** Opens only a generated, strictly recognised public media URL. */
    default StoredMedia openManaged(String publicUrl) {
        throw new CoverStorageUnavailableException("media storage is unavailable");
    }

    /** Opens an exact generated staging cover after the caller has completed ownership checks. */
    default StoredMedia openStagingCover(String objectKey) {
        throw new CoverStorageUnavailableException("cover candidate storage is unavailable");
    }

    /** Deletes an exact generated object key, including private staged candidate objects. */
    default void deleteManagedObject(String objectKey) {
        if (objectKey == null || !objectKey.matches("(?:covers|banners)/[0-9a-fA-F-]{36}\\.(?:png|jpg)")) {
            throw new IllegalArgumentException("media object key is invalid");
        }
        deleteManaged("/media/" + objectKey);
    }

    record StoredCover(String publicUrl, String objectKey) { }
    record StoredStagedCover(String objectKey) { }
    record StoredMedia(InputStream stream, String contentType) { }
}
