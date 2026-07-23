package cn.edu.training.novel.api;

import com.fasterxml.jackson.annotation.JsonProperty;
import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Null;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.io.InputStream;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.JsonNode;

@RestController @RequestMapping("/api/v1/author")
public class AuthorController implements UserResolver {
    private final NovelStore store;
    private final CoverUploadService coverUploadService;
    private final BookPresentationService bookPresentations;
    private final MediaAssetService mediaAssets;
    private final AuthorWorkspacePageService workspacePages;
    public AuthorController(NovelStore store,CoverUploadService coverUploadService,BookPresentationService bookPresentations,MediaAssetService mediaAssets,AuthorWorkspacePageService workspacePages){this.store=store;this.coverUploadService=coverUploadService;this.bookPresentations=bookPresentations;this.mediaAssets=mediaAssets;this.workspacePages=workspacePages;}
    @GetMapping("/books")
    ApiResponse<BookPresentationPage> list(
            HttpServletRequest request,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="12") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.AUTHOR);
        return ApiResponse.ok(store.authorBooks(u.id(), page, size));
    }
    @GetMapping("/books/{bookId}/status-audits")
    ApiResponse<BookStatusAuditPage> statusAudits(
            HttpServletRequest request,
            @PathVariable long bookId,
            @RequestParam(defaultValue="0") @Min(0) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(BookPageService.MAX_PAGE_SIZE) int size) {
        CurrentUser u=current(request);
        u.require(Role.AUTHOR);
        return ApiResponse.ok(store.authorBookStatusAudits(u.id(), bookId, page, size));
    }
    @PostMapping("/books") ApiResponse<BookPresentation> create(HttpServletRequest request,@Valid @RequestBody BookRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(bookPresentations.present(store.createBook(u.id(),body.title(),body.category(),body.synopsis())));}
    @PutMapping("/books/{bookId}") ApiResponse<BookPresentation> updateBook(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookUpdateRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(bookPresentations.present(store.updateBookMetadata(u.id(),bookId,body.title(),body.category(),body.synopsis(),body.serialStatus())));}
    @PostMapping(path="/books/{bookId}/cover", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    ApiResponse<CoverUploadResponse> uploadCover(HttpServletRequest request,@PathVariable long bookId,@RequestPart("file") MultipartFile file){CurrentUser u=current(request);u.require(Role.AUTHOR);CoverUploadResult result=coverUploadService.upload(u.id(),bookId,file);return ApiResponse.ok(new CoverUploadResponse(bookPresentations.present(result.book()),result.candidate()));}
    @GetMapping("/books/{bookId}/cover-candidates") ApiResponse<List<BookCoverCandidate>> coverCandidates(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(mediaAssets.authorBookCoverCandidates(u.id(),bookId));}
    @GetMapping("/books/{bookId}/cover-candidates/{candidateId}/preview") ResponseEntity<StreamingResponseBody> coverCandidatePreview(HttpServletRequest request,@PathVariable long bookId,@PathVariable long candidateId){CurrentUser u=current(request);u.require(Role.AUTHOR);return privatePreview(mediaAssets.authorCoverCandidatePreview(u.id(),bookId,candidateId));}
    @DeleteMapping("/books/{bookId}") ApiResponse<DeleteResult> deleteBook(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);store.deleteBook(u.id(),bookId);return ApiResponse.ok(new DeleteResult(bookId,true));}
    @GetMapping("/books/{bookId}/volumes") ApiResponse<AuthorWorkspaceVolumePage> volumes(HttpServletRequest request,@PathVariable long bookId,@RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="20") @Min(1) @Max(AuthorWorkspacePageService.MAX_PAGE_SIZE) int size){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(workspacePages.volumes(u.id(),bookId,page,size));}
    @PostMapping("/books/{bookId}/volumes") ApiResponse<Volume> createVolume(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody VolumeRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.createVolume(u.id(),bookId,body.title()));}
    @PutMapping("/books/{bookId}/volumes/{volumeId}") ApiResponse<Volume> updateVolume(HttpServletRequest request,@PathVariable long bookId,@PathVariable long volumeId,@Valid @RequestBody VolumeRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.updateVolume(u.id(),bookId,volumeId,body.title()));}
    @PutMapping("/books/{bookId}/volumes/{volumeId}/order") ApiResponse<Volume> reorderVolume(HttpServletRequest request,@PathVariable long bookId,@PathVariable long volumeId,@Valid @RequestBody VolumeOrderRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.reorderVolume(u.id(),bookId,volumeId,body.orderNo()));}
    @DeleteMapping("/books/{bookId}/volumes/{volumeId}") ApiResponse<VolumeDeleteResult> deleteVolume(HttpServletRequest request,@PathVariable long bookId,@PathVariable long volumeId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.deleteVolume(u.id(),bookId,volumeId));}
    @GetMapping("/books/{bookId}/chapters") ApiResponse<AuthorWorkspaceChapterPage> chapters(HttpServletRequest request,@PathVariable long bookId,@RequestParam(defaultValue="0") @Min(0) int page,@RequestParam(defaultValue="20") @Min(1) @Max(AuthorWorkspacePageService.MAX_PAGE_SIZE) int size){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(workspacePages.chapters(u.id(),bookId,page,size));}
    @PostMapping("/books/{bookId}/chapters") ApiResponse<Chapter> chapter(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody ChapterRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.addChapter(u.id(),bookId,body.volumeId(),body.title(),body.content(),body.submit()));}
    @PutMapping("/books/{bookId}/chapters/{chapterId}") ApiResponse<Chapter> updateChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId,@Valid @RequestBody ChapterUpdateRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.updateChapter(u.id(),bookId,chapterId,body.title(),body.content(),body.volumeId()));}
    @DeleteMapping("/books/{bookId}/chapters/{chapterId}") ApiResponse<DeleteResult> deleteChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId){CurrentUser u=current(request);u.require(Role.AUTHOR);store.deleteChapter(u.id(),bookId,chapterId);return ApiResponse.ok(new DeleteResult(chapterId,true));}
    @PostMapping("/books/{bookId}/chapters/{chapterId}/submit") ApiResponse<Chapter> submitChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.submitChapter(u.id(),bookId,chapterId));}
    @PostMapping("/books/{bookId}/chapters/{chapterId}/schedule") ApiResponse<Chapter> scheduleChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId,@Valid @RequestBody ScheduleChapterRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.scheduleChapter(u.id(),bookId,chapterId,body.publishAt()));}
    @PostMapping("/scheduled-publications/run") ApiResponse<DuePublicationResult> publishDue(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.publishDueChapters(u.id(),Instant.now()));}
    @PostMapping("/books/{bookId}/submit") ApiResponse<BookPresentation> submit(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(bookPresentations.present(store.submitBook(u.id(),bookId)));}
    public record BookRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=128) String category,@NotBlank @Size(max=20000) String synopsis){}
    public record BookUpdateRequest(
            @NotBlank @Size(max=255) String title,
            @NotBlank @Size(max=128) String category,
            @NotBlank @Size(max=20000) String synopsis,
            @Size(max=32) String serialStatus,
            @JsonProperty(value="cover", access=JsonProperty.Access.WRITE_ONLY)
            @Null(message="book cover is managed only through the media upload endpoint")
            JsonNode rejectedCoverInput) {}
    public record VolumeRequest(@NotBlank @Size(max=255) String title){}
    public record VolumeOrderRequest(@Min(1) int orderNo){}
    public record ChapterRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=20000) String content,@NotNull Boolean submit,Long volumeId){}
    public record ChapterUpdateRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=20000) String content,Long volumeId){}
    public record ScheduleChapterRequest(@NotNull @Future Instant publishAt){}
    public record CoverUploadResponse(BookPresentation book,BookCoverCandidate candidate){}
    public record DeleteResult(long id,boolean deleted){}

    private static ResponseEntity<StreamingResponseBody> privatePreview(CoverObjectStorage.StoredMedia media){
        StreamingResponseBody body=output->{try(InputStream input=media.stream()){input.transferTo(output);}};
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(media.contentType()))
                .cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(body);
    }
}
