package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AuthorApplication;
import cn.edu.training.novel.domain.AuthorApplicationPage;
import cn.edu.training.novel.domain.PageMeta;
import cn.edu.training.novel.mapper.AuthorApplicationPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read boundary for the administrator-owned, growing author-application review queue. */
@Service
@Transactional(readOnly = true)
public class AuthorApplicationPageService {
    public static final int MAX_PAGE_SIZE = 100;

    private final AuthorApplicationPageMapper mapper;

    public AuthorApplicationPageService(AuthorApplicationPageMapper mapper) {
        this.mapper = mapper;
    }

    public AuthorApplicationPage pendingApplications(int page, int size) {
        IPage<AuthorApplicationPageMapper.AuthorApplicationRow> result =
                mapper.selectPendingApplicationPage(request(page, size));
        return new AuthorApplicationPage(
                result.getRecords().stream().map(AuthorApplicationPageService::application).toList(),
                new PageMeta(result.getTotal(), page, size));
    }

    private static AuthorApplication application(AuthorApplicationPageMapper.AuthorApplicationRow row) {
        return new AuthorApplication(
                row.getId(),
                row.getUserId(),
                row.getPenName(),
                row.getStatement(),
                row.getStatus(),
                row.getReason(),
                row.getCreatedAt().toInstant(),
                row.getDecidedAt() == null ? null : row.getDecidedAt().toInstant(),
                row.getDecidedByUserId(),
                row.getReapplyAvailableAt() == null ? null : row.getReapplyAvailableAt().toInstant());
    }

    private static <T> Page<T> request(int page, int size) {
        if (page < 0) {
            throw new IllegalArgumentException("page must be non-negative");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        }
        return new Page<>(Math.addExact(page, 1L), size, true);
    }
}
