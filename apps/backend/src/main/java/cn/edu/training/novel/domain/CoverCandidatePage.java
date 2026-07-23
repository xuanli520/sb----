package cn.edu.training.novel.domain;

import java.util.List;

/** Server-side page for the stationmaster's private cover-review queue. */
public record CoverCandidatePage(List<BookCoverCandidateQueueItem> items, MediaAssetPage.Meta meta) {
    public CoverCandidatePage {
        items = List.copyOf(items);
    }
}
