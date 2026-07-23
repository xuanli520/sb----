package cn.edu.training.novel.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.mapper.CatalogPageMapper;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Adapts the zero-based public API to MyBatis-Plus's one-based Page contract. */
@Service
@Transactional(readOnly = true)
public class CatalogPageService {
    private static final int MAX_PAGE_SIZE = 48;
    private final CatalogPageMapper mapper;

    public CatalogPageService(CatalogPageMapper mapper) {
        this.mapper = mapper;
    }

    public CatalogPage page(CatalogDiscoveryQuery criteria, int page, int size) {
        if (page < 0) throw new IllegalArgumentException("page must be non-negative");
        if (size < 1 || size > MAX_PAGE_SIZE) throw new IllegalArgumentException("size must be between 1 and " + MAX_PAGE_SIZE);
        Page<Book> request = new Page<>(Math.addExact(page, 1L), size, true);
        IPage<Book> result = mapper.selectPublishedPage(
                request,
                criteria.query().isEmpty() ? null : fuzzyPattern(criteria.query()),
                blankToNull(criteria.category()),
                blankToNull(criteria.serialStatus()),
                criteria.minWords(),
                criteria.maxWords());
        return new CatalogPage(result.getRecords(), result.getTotal(), page, size);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static String fuzzyPattern(String term) {
        return "%" + term.toLowerCase(Locale.ROOT)
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_") + "%";
    }

    public record CatalogPage(List<Book> items, long total, int page, int size) {
        public CatalogPage {
            items = List.copyOf(items);
        }
    }
}
