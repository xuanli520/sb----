package cn.edu.training.novel.domain;

/** A persisted editorial placement and its public catalog representation. */
public record EditorialRecommendation(Book book, int rank) {}
