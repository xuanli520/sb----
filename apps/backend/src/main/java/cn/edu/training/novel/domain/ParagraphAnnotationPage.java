package cn.edu.training.novel.domain;

import java.util.List;

/** A bounded annotation slice with the API's established pagination envelope. */
public record ParagraphAnnotationPage(List<ParagraphAnnotation> items, long total, int page, int size) {}
