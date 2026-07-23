package cn.edu.training.novel.service;

import cn.edu.training.novel.config.CoverStorageProperties;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;
import java.util.Optional;
import java.util.UUID;

/** MinIO implementation backed by a private endpoint and relative public Nginx media URLs. */
public final class MinioCoverObjectStorage implements CoverObjectStorage {
    private static final String PREFIX = "covers/";
    private static final String BANNER_PREFIX = "banners/";
    private static final String STAGING_PREFIX = "staging/";
    private final MinioClient client;
    private final String bucket;
    private final String publicBasePath;

    public MinioCoverObjectStorage(CoverStorageProperties properties) {
        if (!properties.isComplete()) throw new IllegalArgumentException("incomplete cover storage configuration");
        URI endpoint = properties.storageEndpoint().orElseThrow();
        this.client = MinioClient.builder()
                .endpoint(endpoint.toString())
                .credentials(properties.accessKey().trim(), properties.secretKey().trim())
                .build();
        this.bucket = properties.bucket().trim();
        this.publicBasePath = properties.normalizedPublicBasePath();
    }

    @Override
    public StoredCover store(CoverImage image) {
        return store(image, PREFIX);
    }

    @Override
    public StoredCover storeBanner(CoverImage image) {
        return store(image, BANNER_PREFIX);
    }

    @Override
    public StoredStagedCover storeStagingCover(CoverImage image) {
        String objectKey = STAGING_PREFIX + UUID.randomUUID() + "." + image.extension();
        put(image, objectKey);
        return new StoredStagedCover(objectKey);
    }

    @Override
    public StoredCover promoteStagingCover(String stagingObjectKey) {
        if (!isStagingObjectKey(stagingObjectKey)) throw new IllegalArgumentException("media object key is invalid");
        String objectKey = PREFIX + UUID.randomUUID() + extension(stagingObjectKey);
        try {
            client.copyObject(CopyObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .source(CopySource.builder().bucket(bucket).object(stagingObjectKey).build())
                    .build());
            return new StoredCover(publicUrl(objectKey), objectKey);
        } catch (Exception exception) {
            throw new CoverStorageUnavailableException("cover candidate promotion storage is unavailable", exception);
        }
    }

    private StoredCover store(CoverImage image, String prefix) {
        String objectKey = prefix + UUID.randomUUID() + "." + image.extension();
        put(image, objectKey);
        return new StoredCover(publicUrl(objectKey), objectKey);
    }

    private void put(CoverImage image, String objectKey) {
        try {
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .stream(new ByteArrayInputStream(image.bytes()), image.bytes().length, -1)
                    .contentType(image.contentType())
                    .build());
        } catch (Exception exception) {
            throw new CoverStorageUnavailableException("cover upload storage is unavailable", exception);
        }
    }

    @Override
    public void deleteManaged(String publicUrl) {
        Optional<String> objectKey = managedObjectKey(publicUrl);
        if (objectKey.isEmpty()) return;
        try {
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(objectKey.orElseThrow()).build());
        } catch (Exception exception) {
            throw new CoverStorageUnavailableException("cover upload storage cleanup is unavailable", exception);
        }
    }

    @Override public boolean isManaged(String publicUrl) { return managedObjectKey(publicUrl).isPresent(); }

    @Override
    public void deleteManagedObject(String objectKey) {
        if (!isPublicObjectKey(objectKey) && !isStagingObjectKey(objectKey)) {
            throw new IllegalArgumentException("media object key is invalid");
        }
        try {
            client.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(objectKey).build());
        } catch (Exception exception) {
            throw new CoverStorageUnavailableException("cover upload storage cleanup is unavailable", exception);
        }
    }

    @Override
    public StoredMedia openManaged(String publicUrl) {
        Optional<String> objectKey = managedObjectKey(publicUrl);
        if (objectKey.isEmpty()) throw new IllegalArgumentException("media path is invalid");
        try {
            InputStream stream = client.getObject(GetObjectArgs.builder().bucket(bucket).object(objectKey.orElseThrow()).build());
            return new StoredMedia(stream, objectKey.orElseThrow().endsWith(".png") ? "image/png" : "image/jpeg");
        } catch (Exception exception) {
            throw new CoverStorageUnavailableException("media storage is unavailable", exception);
        }
    }

    @Override
    public StoredMedia openStagingCover(String objectKey) {
        if (!isStagingObjectKey(objectKey)) throw new IllegalArgumentException("media object key is invalid");
        try {
            InputStream stream = client.getObject(GetObjectArgs.builder().bucket(bucket).object(objectKey).build());
            return new StoredMedia(stream, objectKey.endsWith(".png") ? "image/png" : "image/jpeg");
        } catch (Exception exception) {
            throw new CoverStorageUnavailableException("cover candidate storage is unavailable", exception);
        }
    }

    private String publicUrl(String objectKey) { return publicBasePath + "/" + objectKey; }

    private Optional<String> managedObjectKey(String publicUrl) {
        if (publicUrl == null) return Optional.empty();
        String prefix = publicBasePath + "/";
        if (!publicUrl.startsWith(prefix)) return Optional.empty();
        String key = publicUrl.substring((publicBasePath + "/").length());
        // Generated keys are exact UUID names, so no URL from a user-controlled field can escape
        // the cover prefix or turn into a request for a different object.
        if (!isPublicObjectKey(key)) return Optional.empty();
        return Optional.of(key);
    }

    private static boolean isPublicObjectKey(String key) {
        return key != null && key.matches("(?:covers|banners)/[0-9a-fA-F-]{36}\\.(?:png|jpg)");
    }

    private static boolean isStagingObjectKey(String key) {
        return key != null && key.matches("staging/[0-9a-fA-F-]{36}\\.(?:png|jpg)");
    }

    private static String extension(String objectKey) {
        return objectKey.endsWith(".png") ? ".png" : ".jpg";
    }
}
