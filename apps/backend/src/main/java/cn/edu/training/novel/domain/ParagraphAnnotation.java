package cn.edu.training.novel.domain;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * A reader-owned highlight anchored to an exact UTF-16 slice of one paragraph.  {@code status}
 * describes its sharing lifecycle: private records never enter a public read model, while a
 * requested share is visible only after a moderator approves it.
 */
public record ParagraphAnnotation(
        long id,
        long bookId,
        long chapterId,
        long userId,
        String authorName,
        int paragraphIndex,
        int selectionStart,
        int selectionEnd,
        String selectedText,
        String note,
        boolean shareIntent,
        String status,
        Instant createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) AuthorModerationAdvice authorModerationAdvice) {}
