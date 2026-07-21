package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.OperatingTaxonomyItem;
import cn.edu.training.novel.service.AdminOperationsService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Public discovery vocabulary. Disabled items are never exposed to browsers. */
@RestController
@RequestMapping("/api/v1/public/taxonomy")
public class PublicTaxonomyController {
    private final AdminOperationsService service;

    public PublicTaxonomyController(AdminOperationsService service) {
        this.service = service;
    }

    @GetMapping("/categories")
    ApiResponse<List<OperatingTaxonomyItem>> categories() {
        return ApiResponse.ok(service.activeTaxonomy("CATEGORY"));
    }

    @GetMapping("/tags")
    ApiResponse<List<OperatingTaxonomyItem>> tags() {
        return ApiResponse.ok(service.activeTaxonomy("TAG"));
    }
}
