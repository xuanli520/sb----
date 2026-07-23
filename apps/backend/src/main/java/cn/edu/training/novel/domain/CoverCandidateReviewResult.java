package cn.edu.training.novel.domain;

/** Returns both the reviewed candidate and the current book projection after an operator decision. */
public record CoverCandidateReviewResult(Book book, BookCoverCandidate candidate) { }
