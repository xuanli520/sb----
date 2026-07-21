package cn.edu.training.novel.domain;

import java.util.List;

/** A bounded comment slice with the metadata expected by the web API adapter. */
public record CommentPage(List<Comment> items, long total, int page, int size) {}
