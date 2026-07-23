package cn.edu.training.novel.service;

/** Default capability when MinIO/S3-compatible storage has not been completely configured. */
public final class UnavailableCoverObjectStorage implements CoverObjectStorage {
    private final String reason;

    public UnavailableCoverObjectStorage(String reason) { this.reason = reason; }

    @Override public StoredCover store(CoverImage image) { throw new CoverStorageUnavailableException(reason); }
    @Override public StoredStagedCover storeStagingCover(CoverImage image) { throw new CoverStorageUnavailableException(reason); }
    @Override public StoredCover promoteStagingCover(String stagingObjectKey) { throw new CoverStorageUnavailableException(reason); }
    @Override public StoredCover storeBanner(CoverImage image) { throw new CoverStorageUnavailableException(reason); }
    @Override public void deleteManaged(String publicUrl) { }
    @Override public boolean isManaged(String publicUrl) { return false; }
    @Override public StoredMedia openManaged(String publicUrl) { throw new CoverStorageUnavailableException(reason); }
    @Override public StoredMedia openStagingCover(String objectKey) { throw new CoverStorageUnavailableException(reason); }
    @Override public void deleteManagedObject(String objectKey) { }
}
