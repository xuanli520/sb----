package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.PageMeta;
import cn.edu.training.novel.domain.SensitiveWord;
import cn.edu.training.novel.domain.SensitiveWordAudit;
import cn.edu.training.novel.domain.SensitiveWordAuditPage;
import cn.edu.training.novel.domain.SensitiveWordPage;
import cn.edu.training.novel.mapper.SensitiveWordPageMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Single bounded read path for vocabulary and its append-only operator audit. */
@Service
@Transactional(readOnly = true)
public class SensitiveWordPageService {
    public static final int MAX_PAGE_SIZE = 100;

    private final SensitiveWordPageMapper mapper;

    public SensitiveWordPageService(SensitiveWordPageMapper mapper) {
        this.mapper = mapper;
    }

    public SensitiveWordPage words(String query, Boolean enabled, int page, int size) {
        IPage<SensitiveWordPageMapper.SensitiveWordRow> result = mapper.selectSensitiveWordPage(
                request(page, size), pattern(query), enabled);
        return new SensitiveWordPage(
                result.getRecords().stream().map(SensitiveWordPageService::word).toList(),
                meta(result, page, size));
    }

    public SensitiveWordAuditPage audits(String normalizedWord, String action, int page, int size) {
        IPage<SensitiveWordPageMapper.SensitiveWordAuditRow> result = mapper.selectSensitiveWordAuditPage(
                request(page, size), normalizedWord(normalizedWord), action(action));
        return new SensitiveWordAuditPage(
                result.getRecords().stream().map(SensitiveWordPageService::audit).toList(),
                meta(result, page, size));
    }

    private static SensitiveWord word(SensitiveWordPageMapper.SensitiveWordRow row) {
        return new SensitiveWord(
                row.getNormalizedWord(),
                row.getWord(),
                row.isEnabled(),
                row.getCreatedByUserId(),
                row.getUpdatedByUserId(),
                row.getDisabledByUserId(),
                row.getDisabledAt() == null ? null : row.getDisabledAt().toInstant(),
                row.getCreatedAt().toInstant(),
                row.getUpdatedAt().toInstant());
    }

    private static SensitiveWordAudit audit(SensitiveWordPageMapper.SensitiveWordAuditRow row) {
        return new SensitiveWordAudit(
                row.getId(),
                row.getNormalizedWord(),
                row.getPreviousWord(),
                row.getWord(),
                row.getPreviousEnabled(),
                row.getEnabled(),
                row.getAction(),
                row.getReason(),
                row.getOperatorUserId(),
                row.getCreatedAt().toInstant());
    }

    private static <T> Page<T> request(int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be non-negative");
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        }
        return new Page<>(Math.addExact(page, 1L), size, true);
    }

    private static PageMeta meta(IPage<?> result, int page, int size) {
        return new PageMeta(result.getTotal(), page, size);
    }

    private static String pattern(String query) {
        if (query == null || query.isBlank()) return null;
        String value = query.trim();
        if (value.length() > 128) throw new IllegalArgumentException("query must be at most 128 characters");
        return "%" + value.toLowerCase(Locale.ROOT)
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_") + "%";
    }

    private static String normalizedWord(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 128) throw new IllegalArgumentException("normalized word must be at most 128 characters");
        return normalized;
    }

    private static String action(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (normalized.length() > 32) throw new IllegalArgumentException("action must be at most 32 characters");
        return normalized;
    }
}
