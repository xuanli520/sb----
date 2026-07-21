package cn.edu.training.novel.domain;

import java.util.List;

/** Outcome of a due-publication run for one author's content. */
public record DuePublicationResult(
        int processed,
        List<Chapter> published,
        List<Chapter> needsReview) {}
