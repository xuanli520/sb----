package cn.edu.training.novel.domain;

import java.util.List;

/** Bounded server-side page for platform media inventory. */
public record MediaAssetPage(List<MediaAsset> items, Meta meta) {
    public MediaAssetPage {
        items = List.copyOf(items);
    }

    public record Meta(long total, int page, int size) { }
}
