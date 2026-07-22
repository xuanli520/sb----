package cn.edu.training.novel.domain;

import java.util.List;

/** Published work metadata plus an access-filtered chapter projection for the reading surface. */
public record ReaderBookDetail(
        Book book,
        List<ReaderChapter> chapters,
        List<Comment> comments,
        ReaderBookAccess access) {
    public ReaderBookDetail {
        chapters = List.copyOf(chapters);
        comments = List.copyOf(comments);
    }
}
