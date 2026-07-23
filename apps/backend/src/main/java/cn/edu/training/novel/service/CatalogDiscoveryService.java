package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.BookPresentation;
import cn.edu.training.novel.domain.HomeCarouselSlide;
import cn.edu.training.novel.domain.HotSearchTerm;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only use cases for the public discovery surface. Editorial rank and heat are persisted
 * catalog attributes, so a home response is deterministic for a given database state.
 */
@Service
@Transactional(readOnly = true)
public class CatalogDiscoveryService {
    private static final int EDITORIAL_LIMIT = 12;
    private static final int HOT_LIMIT = 10;
    private static final int MAX_PUBLIC_LIMIT = 20;

    private static final List<WordCountRange> WORD_COUNT_RANGES = List.of(
            new WordCountRange("under-100k", "10 万字以下", null, 99_999),
            new WordCountRange("100k-300k", "10-30 万字", 100_000, 299_999),
            new WordCountRange("300k-500k", "30-50 万字", 300_000, 499_999),
            new WordCountRange("over-500k", "50 万字以上", 500_000, null));

    private final CatalogRepository catalogRepository;
    private final EditorialOperationsService editorialOperationsService;
    private final CatalogPageService catalogPageService;
    private final BookPresentationService presentationService;
    private final HomeCarouselService homeCarouselService;

    public CatalogDiscoveryService(
            CatalogRepository catalogRepository,
            EditorialOperationsService editorialOperationsService,
            CatalogPageService catalogPageService,
            BookPresentationService presentationService,
            HomeCarouselService homeCarouselService) {
        this.catalogRepository = catalogRepository;
        this.editorialOperationsService = editorialOperationsService;
        this.catalogPageService = catalogPageService;
        this.presentationService = presentationService;
        this.homeCarouselService = homeCarouselService;
    }

    public CatalogPage books(
            String query,
            String category,
            String serialStatus,
            Integer minWords,
            Integer maxWords,
            int page,
            int size) {
        CatalogDiscoveryQuery criteria = new CatalogDiscoveryQuery(
                query,
                category,
                serialStatus,
                minWords,
                maxWords);
        CatalogPageService.CatalogPage result = catalogPageService.page(criteria, page, size);
        return new CatalogPage(
                presentationService.present(result.items()),
                new CatalogMetadata(result.total(), result.page(), result.size(), facets(), criteria));
    }

    public DiscoveryHome home() {
        List<BookPresentation> recommendations = presentationService.present(
                catalogRepository.findEditorRecommendations(EDITORIAL_LIMIT));
        return new DiscoveryHome(
                homeCarouselService.publicSlides(),
                recommendations,
                presentationService.present(catalogRepository.findHot(HOT_LIMIT)),
                editorialOperationsService.publicHotSearchTerms(),
                facets());
    }

    public List<BookPresentation> hot(int requestedLimit) {
        return presentationService.present(catalogRepository.findHot(normalizeLimit(requestedLimit)));
    }

    public List<BookPresentation> recommendations(int requestedLimit) {
        return presentationService.present(catalogRepository.findEditorRecommendations(normalizeLimit(requestedLimit)));
    }

    public List<HotSearchTerm> hotSearchTerms() {
        return editorialOperationsService.publicHotSearchTerms();
    }

    private DiscoveryFacets facets() {
        return new DiscoveryFacets(
                catalogRepository.findPublishedCategories(),
                catalogRepository.findPublishedSerialStatuses(),
                WORD_COUNT_RANGES);
    }

    private static int normalizeLimit(int requestedLimit) {
        return Math.max(1, Math.min(requestedLimit, MAX_PUBLIC_LIMIT));
    }

    public record CatalogPage(List<BookPresentation> items, CatalogMetadata meta) {
        public CatalogPage {
            items = List.copyOf(items);
        }
    }

    public record CatalogMetadata(long total, int page, int size, DiscoveryFacets facets, CatalogDiscoveryQuery query) { }

    public record DiscoveryHome(
            List<HomeCarouselSlide> carousel,
            List<BookPresentation> recommendations,
            List<BookPresentation> hot,
            List<HotSearchTerm> hotSearchTerms,
            DiscoveryFacets facets) {
        public DiscoveryHome {
            carousel = List.copyOf(carousel);
            recommendations = List.copyOf(recommendations);
            hot = List.copyOf(hot);
            hotSearchTerms = List.copyOf(hotSearchTerms);
        }
    }

    public record DiscoveryFacets(
            List<String> categories,
            List<String> serialStatuses,
            List<WordCountRange> wordCountRanges) {
        public DiscoveryFacets {
            categories = List.copyOf(categories);
            serialStatuses = List.copyOf(serialStatuses);
            wordCountRanges = List.copyOf(wordCountRanges);
        }
    }

    public record WordCountRange(String key, String label, Integer minWords, Integer maxWords) { }
}
