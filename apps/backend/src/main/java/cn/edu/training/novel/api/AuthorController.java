package cn.edu.training.novel.api;

import cn.edu.training.novel.domain.*;
import cn.edu.training.novel.service.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;

@RestController @RequestMapping("/api/v1/author")
public class AuthorController implements UserResolver {
    private final NovelStore store;
    private final CoverUploadService coverUploadService;
    public AuthorController(NovelStore store, CoverUploadService coverUploadService){this.store=store;this.coverUploadService=coverUploadService;}
    @GetMapping("/books") ApiResponse<List<Book>> list(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.authorBooks(u.id()));}
    @PostMapping("/books") ApiResponse<Book> create(HttpServletRequest request,@Valid @RequestBody BookRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.createBook(u.id(),body.title(),body.category(),body.synopsis()));}
    @PutMapping("/books/{bookId}") ApiResponse<Book> updateBook(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody BookUpdateRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.updateBookMetadata(u.id(),bookId,body.title(),body.category(),body.synopsis(),body.serialStatus(),body.cover()));}
    @PostMapping(path="/books/{bookId}/cover", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    ApiResponse<Book> uploadCover(HttpServletRequest request,@PathVariable long bookId,@RequestPart("file") MultipartFile file){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(coverUploadService.upload(u.id(),bookId,file));}
    @DeleteMapping("/books/{bookId}") ApiResponse<DeleteResult> deleteBook(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);store.deleteBook(u.id(),bookId);return ApiResponse.ok(new DeleteResult(bookId,true));}
    @GetMapping("/books/{bookId}/volumes") ApiResponse<List<Volume>> volumes(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.authorVolumes(u.id(),bookId));}
    @PostMapping("/books/{bookId}/volumes") ApiResponse<Volume> createVolume(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody VolumeRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.createVolume(u.id(),bookId,body.title()));}
    @GetMapping("/books/{bookId}/chapters") ApiResponse<List<Chapter>> chapters(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.authorChapters(u.id(),bookId));}
    @PostMapping("/books/{bookId}/chapters") ApiResponse<Chapter> chapter(HttpServletRequest request,@PathVariable long bookId,@Valid @RequestBody ChapterRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.addChapter(u.id(),bookId,body.volumeId(),body.title(),body.content(),body.submit()));}
    @PostMapping("/books/{bookId}/volumes/{volumeId}/chapters") ApiResponse<Chapter> draftChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long volumeId,@Valid @RequestBody DraftChapterRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.createDraftChapter(u.id(),bookId,volumeId,body.title(),body.content()));}
    @PutMapping("/books/{bookId}/chapters/{chapterId}") ApiResponse<Chapter> updateChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId,@Valid @RequestBody ChapterUpdateRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.updateChapter(u.id(),bookId,chapterId,body.title(),body.content(),body.volumeId()));}
    @DeleteMapping("/books/{bookId}/chapters/{chapterId}") ApiResponse<DeleteResult> deleteChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId){CurrentUser u=current(request);u.require(Role.AUTHOR);store.deleteChapter(u.id(),bookId,chapterId);return ApiResponse.ok(new DeleteResult(chapterId,true));}
    @PostMapping("/books/{bookId}/chapters/{chapterId}/submit") ApiResponse<Chapter> submitChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.submitChapter(u.id(),bookId,chapterId));}
    @PostMapping("/books/{bookId}/chapters/{chapterId}/schedule") ApiResponse<Chapter> scheduleChapter(HttpServletRequest request,@PathVariable long bookId,@PathVariable long chapterId,@Valid @RequestBody ScheduleChapterRequest body){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.scheduleChapter(u.id(),bookId,chapterId,body.publishAt()));}
    @PostMapping("/scheduled-publications/run") ApiResponse<DuePublicationResult> publishDue(HttpServletRequest request){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.publishDueChapters(u.id(),Instant.now()));}
    @PostMapping("/books/{bookId}/submit") ApiResponse<Book> submit(HttpServletRequest request,@PathVariable long bookId){CurrentUser u=current(request);u.require(Role.AUTHOR);return ApiResponse.ok(store.submitBook(u.id(),bookId));}
    public record BookRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=128) String category,@NotBlank @Size(max=20000) String synopsis){}
    public record BookUpdateRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=128) String category,@NotBlank @Size(max=20000) String synopsis,@Size(max=32) String serialStatus,@Size(max=1024) String cover){}
    public record VolumeRequest(@NotBlank @Size(max=255) String title){}
    public record ChapterRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=20000) String content,boolean submit,Long volumeId){}
    public record DraftChapterRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=20000) String content){}
    public record ChapterUpdateRequest(@NotBlank @Size(max=255) String title,@NotBlank @Size(max=20000) String content,Long volumeId){}
    public record ScheduleChapterRequest(@NotNull @Future Instant publishAt){}
    public record DeleteResult(long id,boolean deleted){}
}
