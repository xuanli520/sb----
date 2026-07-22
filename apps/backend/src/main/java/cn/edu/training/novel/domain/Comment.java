package cn.edu.training.novel.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

public record Comment(long id, long bookId, Long chapterId, long userId, String authorName, String content,
                      String status, Instant createdAt,
                      @JsonInclude(JsonInclude.Include.NON_NULL) AuthorModerationAdvice authorModerationAdvice) { }
