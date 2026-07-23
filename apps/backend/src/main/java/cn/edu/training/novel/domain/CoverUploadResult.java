package cn.edu.training.novel.domain;

/** Direct draft cover replacement or a pending private replacement request for a published work. */
public record CoverUploadResult(Book book, BookCoverCandidate candidate) { }
