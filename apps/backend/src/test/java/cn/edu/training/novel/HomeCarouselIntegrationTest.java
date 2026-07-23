package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.BookCoverCandidateStatus;
import cn.edu.training.novel.domain.CoverUploadResult;
import cn.edu.training.novel.domain.HomeCarouselSlide;
import cn.edu.training.novel.domain.MediaAsset;
import cn.edu.training.novel.domain.MediaAssetState;
import cn.edu.training.novel.service.CoverImage;
import cn.edu.training.novel.service.CoverObjectStorage;
import cn.edu.training.novel.service.CoverUploadService;
import cn.edu.training.novel.service.HomeCarouselService;
import cn.edu.training.novel.service.MediaAssetService;
import cn.edu.training.novel.service.NovelStore;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(classes = {
        NovelPlatformApplication.class,
        HomeCarouselIntegrationTest.FakeMediaStorageConfiguration.class
}, properties = {
        "novel.scheduled-publication.enabled=false",
        "novel.full-book-audit.scheduler-enabled=false",
        "spring.datasource.url=jdbc:h2:mem:home_carousel_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class HomeCarouselIntegrationTest {
    @Autowired HomeCarouselService carousel;
    @Autowired MediaAssetService mediaAssets;
    @Autowired CoverUploadService covers;
    @Autowired NovelStore store;
    @Autowired JdbcTemplate jdbc;

    @Test
    void migrationSeedsEditorialRecommendationsButCarouselThenHasItsOwnOrderingAndAvailability() {
        assertThat(carousel.slides()).extracting(HomeCarouselSlide::rank).containsExactly(1, 2, 3);
        assertThat(carousel.publicSlides()).allSatisfy(slide -> assertThat(slide.book().metrics()).isNotNull());

        HomeCarouselSlide first = carousel.slides().getFirst();
        carousel.update(1L, first.slideId(), new HomeCarouselService.UpdateCommand(
                first.book().id(), null, null, null, false, first.rank(), first.version()));
        insertPublishedBook(400L, "独立轮播作品");

        HomeCarouselSlide created = carousel.create(1L, new HomeCarouselService.CreateCommand(
                400L, null, "首页覆盖标题", "首页覆盖文案", true, 1));
        assertThat(created.rank()).isEqualTo(1);
        assertThat(carousel.publicSlides()).extracting(slide -> slide.book().id()).containsExactly(400L, 3L, 2L);

        carousel.disableSlidesForBook(400L, 1L, "stationmaster took the book down");
        assertThat(carousel.publicSlides()).extracting(slide -> slide.book().id()).doesNotContain(400L);
        assertThat(carousel.audits(20)).extracting(audit -> audit.action()).contains("AUTO_DISABLED");
    }

    @Test
    void platformBannerLifecycleTracksBindingAndRejectsDeletionWhileInUse() throws Exception {
        MediaAsset asset = mediaAssets.uploadPlatformBanner(1L, bannerFile(), "首页测试横幅");
        assertThat(asset.publicUrl()).matches("/media/banners/[0-9a-f-]{36}\\.png");

        HomeCarouselSlide target = carousel.slides().getFirst();
        HomeCarouselSlide updated = carousel.update(1L, target.slideId(), new HomeCarouselService.UpdateCommand(
                target.book().id(), asset.id(), null, null, target.enabled(), target.rank(), target.version()));
        assertThat(mediaAssets.bindings(asset.id())).hasSize(1);
        assertThatThrownBy(() -> mediaAssets.requestDeletePlatformBanner(1L, asset.id()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("in use");

        carousel.remove(1L, updated.slideId(), updated.version());
        MediaAsset pendingDelete = mediaAssets.requestDeletePlatformBanner(1L, asset.id());
        assertThat(pendingDelete.state()).isEqualTo(MediaAssetState.PENDING_DELETE);
        assertThat(mediaAssets.bindings(asset.id())).isEmpty();
        assertThat(mediaAssets.restorePlatformBanner(1L, asset.id()).state()).isEqualTo(MediaAssetState.ACTIVE);
    }

    @Test
    void platformBannerInventoryUsesDatabasePaginationForStateLabelAndUuidPrefixQueries() throws Exception {
        MediaAsset alphaOne = mediaAssets.uploadPlatformBanner(1L, bannerFile(), "Alpha launch");
        MediaAsset beta = mediaAssets.uploadPlatformBanner(1L, bannerFile(), "Beta launch");
        MediaAsset alphaTwo = mediaAssets.uploadPlatformBanner(1L, bannerFile(), "alpha follow-up");
        mediaAssets.archivePlatformBanner(1L, beta.id());

        assertThat(mediaAssets.platformBannerAssets(MediaAssetState.ACTIVE, "ALPHA", 0, 1).meta())
                .extracting(meta -> meta.total(), meta -> meta.page(), meta -> meta.size())
                .containsExactly(2L, 0, 1);
        assertThat(mediaAssets.platformBannerAssets(MediaAssetState.ACTIVE, "alpha", 1, 1).items())
                .hasSize(1)
                .allSatisfy(asset -> assertThat(asset.id()).isIn(alphaOne.id(), alphaTwo.id()));
        assertThat(mediaAssets.platformBannerAssets(
                null, beta.id().toString().substring(0, 8), 0, 24).items())
                .extracting(MediaAsset::id)
                .containsExactly(beta.id());
        assertThat(mediaAssets.platformBannerAssets(MediaAssetState.ARCHIVED, null, 0, 24).items())
                .extracting(MediaAsset::id)
                .containsExactly(beta.id());
    }

    @Test
    void authorCoverUploadRegistersImmutableAssetsAndDefersOldBoundObjectCleanup() throws Exception {
        long bookId = store.createBook(2L, "素材登记封面", "科幻", "cover registry").id();
        covers.upload(2L, bookId, coverFile(0x225577));
        covers.upload(2L, bookId, coverFile(0x553322));

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_media_asset WHERE owner_scope = 'AUTHOR' AND purpose = 'BOOK_COVER'",
                Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_media_asset_binding WHERE binding_type = 'BOOK_COVER' AND target_id = ?",
                Integer.class,
                bookId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_media_asset WHERE purpose = 'BOOK_COVER' AND state = 'PENDING_DELETE'",
                Integer.class)).isEqualTo(1);

        UUID currentCoverAssetId = UUID.fromString(jdbc.queryForObject(
                "SELECT asset_id FROM novel_media_asset_binding WHERE binding_type = 'BOOK_COVER' AND target_id = ?",
                String.class,
                bookId));
        assertThatThrownBy(() -> mediaAssets.platformBannerAsset(currentCoverAssetId))
                .isInstanceOf(SecurityException.class);

        store.deleteBook(2L, bookId);
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM novel_media_asset_binding WHERE binding_type = 'BOOK_COVER' AND target_id = ?",
                Integer.class,
                bookId)).isZero();
        assertThat(jdbc.queryForObject(
                "SELECT state FROM novel_media_asset WHERE id = ?",
                String.class,
                currentCoverAssetId.toString())).isEqualTo(MediaAssetState.PENDING_DELETE.name());
    }

    @Test
    void publishedCoverCandidateApprovalPromotesANewObjectWithoutChangingTheLiveCoverEarly() throws Exception {
        long bookId = store.createBook(2L, "候选封面批准", "科幻", "cover candidate").id();
        CoverUploadResult initial = covers.upload(2L, bookId, coverFile(0x225577));
        String currentUrl = boundCoverUrl(bookId);
        jdbc.update("UPDATE novel_book SET status = ? WHERE id = ?", BookStatus.PUBLISHED.name(), bookId);

        CoverUploadResult proposal = covers.upload(2L, bookId, coverFile(0x553322));
        assertThat(proposal.candidate()).isNotNull();
        assertThat(proposal.candidate().status()).isEqualTo(BookCoverCandidateStatus.PENDING_REVIEW);
        assertThat(boundCoverUrl(bookId)).isEqualTo(currentUrl);
        MediaAsset staged = mediaAssets.asset(proposal.candidate().assetId());
        assertThat(staged.objectKey()).startsWith("staging/");

        var reviewed = mediaAssets.reviewCoverCandidate(1L, proposal.candidate().id(), true, "approved cover");
        assertThat(reviewed.candidate().status()).isEqualTo(BookCoverCandidateStatus.APPROVED);
        assertThat(boundCoverUrl(bookId)).isNotEqualTo(currentUrl).matches("/media/covers/[0-9a-f-]{36}\\.png");
        assertThat(mediaAssets.asset(staged.id()).state()).isEqualTo(MediaAssetState.PENDING_DELETE);
        assertThat(jdbc.queryForObject(
                "SELECT state FROM novel_media_asset WHERE public_url = ?", String.class, currentUrl))
                .isEqualTo(MediaAssetState.PENDING_DELETE.name());
        assertThat(initial.candidate()).isNull();
    }

    @Test
    void rejectedPublishedCoverCandidateKeepsTheExistingPublicBindingAndPrivateEvidence() throws Exception {
        long bookId = store.createBook(2L, "候选封面驳回", "科幻", "cover candidate").id();
        covers.upload(2L, bookId, coverFile(0x225577));
        String currentUrl = boundCoverUrl(bookId);
        jdbc.update("UPDATE novel_book SET status = ? WHERE id = ?", BookStatus.PUBLISHED.name(), bookId);

        CoverUploadResult proposal = covers.upload(2L, bookId, coverFile(0x553322));
        MediaAsset staged = mediaAssets.asset(proposal.candidate().assetId());
        var reviewed = mediaAssets.reviewCoverCandidate(1L, proposal.candidate().id(), false, "keep the current cover");

        assertThat(reviewed.candidate().status()).isEqualTo(BookCoverCandidateStatus.REJECTED);
        assertThat(boundCoverUrl(bookId)).isEqualTo(currentUrl);
        assertThat(mediaAssets.asset(staged.id()).state()).isEqualTo(MediaAssetState.ACTIVE);
        assertThat(fakeMediaStorage.objects).containsKey(staged.objectKey());
    }

    private String boundCoverUrl(long bookId) {
        return jdbc.queryForObject(
                "SELECT asset.public_url FROM novel_media_asset_binding binding "
                        + "JOIN novel_media_asset asset ON asset.id = binding.asset_id "
                        + "WHERE binding.binding_type = 'BOOK_COVER' AND binding.target_id = ?",
                String.class,
                bookId);
    }

    @Autowired FakeMediaStorage fakeMediaStorage;

    private void insertPublishedBook(long id, String title) {
        jdbc.update(
                "INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, "
                        + "author_id, heat, purchase_price, created_at, updated_at) "
                        + "VALUES (?, ?, '测试作者', '科幻', 1000, '连载中', '测试简介', '#234567', ?, 2, 0, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                id, title, BookStatus.PUBLISHED.name());
    }

    private static MockMultipartFile bannerFile() throws Exception {
        return imageFile(1200, 400, 0x225577);
    }

    private static MockMultipartFile coverFile(int color) throws Exception {
        return imageFile(8, 12, color);
    }

    private static MockMultipartFile imageFile(int width, int height, int color) throws Exception {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, color);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, "png", output)).isTrue();
        return new MockMultipartFile("file", "ignored.txt", "text/plain", output.toByteArray());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeMediaStorageConfiguration {
        @Bean
        @Primary
        FakeMediaStorage fakeMediaStorage() {
            return new FakeMediaStorage();
        }
    }

    static final class FakeMediaStorage implements CoverObjectStorage {
        final Map<String, CoverImage> objects = new LinkedHashMap<>();

        @Override
        public StoredCover store(CoverImage image) {
            return save("covers", image);
        }

        @Override
        public StoredCover storeBanner(CoverImage image) {
            return save("banners", image);
        }

        @Override
        public StoredStagedCover storeStagingCover(CoverImage image) {
            String objectKey = "staging/" + UUID.randomUUID() + "." + image.extension();
            objects.put(objectKey, image);
            return new StoredStagedCover(objectKey);
        }

        @Override
        public StoredCover promoteStagingCover(String objectKey) {
            CoverImage image = objects.get(objectKey);
            if (image == null) throw new AssertionError("missing staged cover " + objectKey);
            return save("covers", image);
        }

        @Override
        public void deleteManaged(String publicUrl) {
            objects.remove(publicUrl.substring("/media/".length()));
        }

        @Override
        public boolean isManaged(String publicUrl) {
            return publicUrl != null
                    && publicUrl.startsWith("/media/")
                    && objects.containsKey(publicUrl.substring("/media/".length()));
        }

        @Override
        public void deleteManagedObject(String objectKey) {
            objects.remove(objectKey);
        }

        private StoredCover save(String kind, CoverImage image) {
            String objectKey = kind + "/" + UUID.randomUUID() + "." + image.extension();
            String url = "/media/" + objectKey;
            objects.put(objectKey, image);
            return new StoredCover(url, objectKey);
        }
    }
}
