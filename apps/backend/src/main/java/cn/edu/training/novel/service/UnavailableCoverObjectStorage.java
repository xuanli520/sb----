package cn.edu.training.novel.service;

/** Default capability when MinIO/S3-compatible storage has not been completely configured. */
public final class UnavailableCoverObjectStorage implements CoverObjectStorage {
    private final String reason;

    public UnavailableCoverObjectStorage(String reason) { this.reason = reason; }

    @Override public StoredCover store(CoverImage image) { throw new CoverStorageUnavailableException(reason); }
    @Override public void deleteManaged(String publicUrl) { }
    @Override public boolean isManaged(String publicUrl) { return false; }
}
