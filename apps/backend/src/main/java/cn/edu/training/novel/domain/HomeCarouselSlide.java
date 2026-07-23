package cn.edu.training.novel.domain;

import java.time.Instant;
import java.util.UUID;

/** Public and administrative representation of one manually managed home carousel slide. */
public record HomeCarouselSlide(
        long slideId,
        BookPresentation book,
        UUID bannerAssetId,
        String bannerUrl,
        String headline,
        String copy,
        boolean enabled,
        int rank,
        long version,
        Instant createdAt,
        Instant updatedAt) { }
