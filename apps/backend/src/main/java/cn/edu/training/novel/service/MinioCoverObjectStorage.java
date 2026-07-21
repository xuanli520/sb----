package cn.edu.training.novel.service;

import cn.edu.training.novel.config.CoverStorageProperties;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.util.Optional;
import java.util.UUID;

/** MinIO implementation backed by a private endpoint and relative public Nginx media URLs. */
public final class MinioCoverObjectStorage implements CoverObjectStorage {
    private static final String PREFIX = "covers/";
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
        String objectKey = PREFIX + UUID.randomUUID() + "." + image.extension();
        try {
            client.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(objectKey)
                    .stream(new ByteArrayInputStream(image.bytes()), image.bytes().length, -1)
                    .contentType(image.contentType())
                    .build());
            return new StoredCover(publicUrl(objectKey), objectKey);
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

    private String publicUrl(String objectKey) { return publicBasePath + "/" + objectKey; }

    private Optional<String> managedObjectKey(String publicUrl) {
        if (publicUrl == null) return Optional.empty();
        String prefix = publicBasePath + "/" + PREFIX;
        if (!publicUrl.startsWith(prefix)) return Optional.empty();
        String key = publicUrl.substring((publicBasePath + "/").length());
        // Generated keys are exact UUID names, so no URL from a user-controlled field can escape
        // the cover prefix or turn into a request for a different object.
        if (!key.matches("covers/[0-9a-fA-F-]{36}\\.(?:png|jpg)")) return Optional.empty();
        return Optional.of(key);
    }
}
