package cn.edu.training.novel.domain;
public record Chapter(long id, long bookId, String title, String content, boolean published, int orderNo) {}
