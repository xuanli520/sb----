package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AuthorWorkspaceChapter;
import cn.edu.training.novel.domain.AuthorWorkspaceChapterPage;
import cn.edu.training.novel.domain.AuthorWorkspaceVolume;
import cn.edu.training.novel.domain.AuthorWorkspaceVolumePage;
import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.ChapterCandidate;
import cn.edu.training.novel.domain.ChapterCandidateStatus;
import cn.edu.training.novel.domain.ChapterCandidateType;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.PageMeta;
import cn.edu.training.novel.mapper.AuthorWorkspacePageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.sql.Timestamp;
import java.util.NoSuchElementException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read boundary for author workspace lists that can grow beyond a single browser response. */
@Service
@Transactional(readOnly = true)
public class AuthorWorkspacePageService {
    public static final int MAX_PAGE_SIZE = 100;

    private final AuthorWorkspacePageMapper mapper;
    private final CatalogRepository catalogRepository;

    public AuthorWorkspacePageService(AuthorWorkspacePageMapper mapper, CatalogRepository catalogRepository) {
        this.mapper = mapper;
        this.catalogRepository = catalogRepository;
    }

    public AuthorWorkspaceVolumePage volumes(long authorId, long bookId, int page, int size) {
        requireOwnedBook(authorId, bookId);
        IPage<AuthorWorkspacePageMapper.VolumeRow> result = mapper.selectVolumePage(volumeRequest(page, size), authorId, bookId);
        return new AuthorWorkspaceVolumePage(
                result.getRecords().stream().map(AuthorWorkspacePageService::volume).toList(),
                meta(result, page, size));
    }

    public AuthorWorkspaceChapterPage chapters(long authorId, long bookId, int page, int size) {
        requireOwnedBook(authorId, bookId);
        IPage<AuthorWorkspacePageMapper.ChapterRow> result = mapper.selectChapterPage(chapterRequest(page, size), authorId, bookId);
        return new AuthorWorkspaceChapterPage(
                result.getRecords().stream().map(AuthorWorkspacePageService::chapter).toList(),
                meta(result, page, size));
    }

    private void requireOwnedBook(long authorId, long bookId) {
        if (authorId <= 0 || bookId <= 0) {
            throw new IllegalArgumentException("author and book identifiers are required");
        }
        Book book = catalogRepository.findById(bookId).orElseThrow(() -> new NoSuchElementException("book not found"));
        if (book.authorId() != authorId) {
            throw new SecurityException("resource does not belong to current author");
        }
    }

    private static Page<AuthorWorkspacePageMapper.VolumeRow> volumeRequest(int page, int size) {
        validatePage(page, size);
        return new Page<>(Math.addExact((long) page, 1L), size, true);
    }

    private static Page<AuthorWorkspacePageMapper.ChapterRow> chapterRequest(int page, int size) {
        validatePage(page, size);
        return new Page<>(Math.addExact((long) page, 1L), size, true);
    }

    private static PageMeta meta(IPage<?> result, int page, int size) {
        return new PageMeta(result.getTotal(), page, size);
    }

    private static AuthorWorkspaceVolume volume(AuthorWorkspacePageMapper.VolumeRow row) {
        return new AuthorWorkspaceVolume(
                row.getId(), row.getBookId(), row.getTitle(), row.getOrderNo(), instant(row.getCreatedAt()), row.getChapterCount());
    }

    private static AuthorWorkspaceChapter chapter(AuthorWorkspacePageMapper.ChapterRow row) {
        return new AuthorWorkspaceChapter(
                row.getId(),
                row.getBookId(),
                row.getVolumeId(),
                row.getTitle(),
                row.getContent(),
                row.isPublished(),
                ChapterStatus.valueOf(row.getStatus()),
                instant(row.getScheduledPublishAt()),
                instant(row.getPublishedAt()),
                row.getReviewReason(),
                row.getOrderNo(),
                row.getVolumeTitle(),
                row.getVolumeOrderNo(),
                latestCandidate(row));
    }

    private static ChapterCandidate latestCandidate(AuthorWorkspacePageMapper.ChapterRow row) {
        if (row.getLatestCandidateId() == null) {
            return null;
        }
        return new ChapterCandidate(
                row.getLatestCandidateId(),
                required(row.getLatestCandidateBookId(), "latest candidate book id"),
                required(row.getLatestCandidateTargetChapterId(), "latest candidate target chapter id"),
                row.getLatestCandidateVolumeId(),
                ChapterCandidateType.valueOf(row.getLatestCandidateType()),
                row.getLatestCandidateTitle(),
                row.getLatestCandidateContent(),
                required(row.getLatestCandidateOrderNo(), "latest candidate order"),
                ChapterCandidateStatus.valueOf(row.getLatestCandidateStatus()),
                row.getLatestCandidateReviewReason(),
                row.getLatestCandidateModerationAuditId(),
                required(row.getLatestCandidateCreatedByUserId(), "latest candidate creator"),
                instant(row.getLatestCandidateCreatedAt()),
                row.getLatestCandidateReviewedByUserId(),
                instant(row.getLatestCandidateReviewedAt()));
    }

    private static long required(Long value, String name) {
        if (value == null) {
            throw new IllegalStateException(name + " is missing");
        }
        return value;
    }

    private static int required(Integer value, String name) {
        if (value == null) {
            throw new IllegalStateException(name + " is missing");
        }
        return value;
    }

    private static java.time.Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static void validatePage(int page, int size) {
        if (page < 0) {
            throw new IllegalArgumentException("page must be non-negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        }
    }
}
