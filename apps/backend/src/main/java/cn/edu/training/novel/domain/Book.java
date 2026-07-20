package cn.edu.training.novel.domain;
public record Book(long id, String title, String author, String category, int words, String serialStatus, String synopsis, String cover, BookStatus status, long authorId, long heat) {}
