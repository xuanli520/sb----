package cn.edu.training.novel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import cn.edu.training.novel.domain.Book;
import cn.edu.training.novel.domain.Chapter;
import cn.edu.training.novel.domain.ChapterStatus;
import cn.edu.training.novel.domain.Volume;
import cn.edu.training.novel.service.CatalogRepository;
import cn.edu.training.novel.service.NovelStore;
import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.util.List;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

@UseTestBffSessions
@SpringBootTest(properties = {
        "novel.internal-api-key=local-novel-internal-key",
        "novel.scheduled-publication.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:chapter_import_${random.uuid};MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ChapterImportIntegrationTest {
    private static final String INTERNAL_KEY = "local-novel-internal-key";

    @Autowired MockMvc mvc;
    @Autowired NovelStore store;
    @Autowired CatalogRepository catalog;

    @Test
    void importsTxtHeadingsAsOrderedDraftsAndKeepsParagraphs() throws Exception {
        Book book = store.createBook(2L, "Imported TXT", "科幻", "chapter import test");
        Volume volume = store.createVolume(2L, book.id(), "第一卷");
        MockMultipartFile file = new MockMultipartFile("file", "manuscript.txt", "text/plain",
                "第1章 起点\n第一段。\n\n第二段。\n第2回 远行\n第三段。".getBytes());

        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/chapters/import", book.id()).file(file))
                        .param("volumeId", String.valueOf(volume.id())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.createdChapterCount").value(2))
                .andExpect(jsonPath("$.data.chapters[0].title").value("第1章 起点"))
                .andExpect(jsonPath("$.data.chapters[1].title").value("第2回 远行"));

        List<Chapter> chapters = catalog.findChaptersByBookId(book.id());
        assertThat(chapters).extracting(Chapter::status, Chapter::published, Chapter::volumeId)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(ChapterStatus.DRAFT, false, volume.id()),
                        org.assertj.core.groups.Tuple.tuple(ChapterStatus.DRAFT, false, volume.id()));
        assertThat(chapters.get(0).content()).isEqualTo("第一段。\n\n第二段。");
    }

    @Test
    void importsDocxWithoutHeadingsAndGb18030Txt() throws Exception {
        Book book = store.createBook(2L, "Imported documents", "科幻", "document import test");
        MockMultipartFile docx = new MockMultipartFile("file", "plain.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx("DOCX 第一段", "DOCX 第二段"));
        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/chapters/import", book.id()).file(docx)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.createdChapterCount").value(1));

        MockMultipartFile gb18030 = new MockMultipartFile("file", "encoded.txt", "text/plain",
                "第十章 编码\n这是一段 GB18030 正文。".getBytes(Charset.forName("GB18030")));
        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/chapters/import", book.id()).file(gb18030)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.chapters[0].title").value("第十章 编码"));

        assertThat(catalog.findChaptersByBookId(book.id())).extracting(Chapter::content)
                .contains("DOCX 第一段\n\nDOCX 第二段", "这是一段 GB18030 正文。");
    }

    @Test
    void rejectsInvalidFilesAndForeignBooksWithoutCreatingDrafts() throws Exception {
        Book ownBook = store.createBook(2L, "Invalid import", "科幻", "import validation");
        int ownBefore = catalog.findChaptersByBookId(ownBook.id()).size();
        MockMultipartFile invalid = new MockMultipartFile("file", "manuscript.pdf", "application/pdf", "not a manuscript".getBytes());
        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/chapters/import", ownBook.id()).file(invalid)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.msg").value("only .txt and .docx files can be imported"));
        assertThat(catalog.findChaptersByBookId(ownBook.id())).hasSize(ownBefore);

        MockMultipartFile text = new MockMultipartFile("file", "foreign.txt", "text/plain", "第1章 外部\n不可写入".getBytes());
        mvc.perform(author(multipart("/api/v1/author/books/{bookId}/chapters/import", 2L).file(text)))
                .andExpect(status().isForbidden());
        assertThat(catalog.findChaptersByBookId(2L)).hasSize(1);
    }

    private static byte[] docx(String... paragraphs) throws Exception {
        try (XWPFDocument document = new XWPFDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            for (String paragraph : paragraphs) document.createParagraph().createRun().setText(paragraph);
            document.write(output);
            return output.toByteArray();
        }
    }

    private static MockMultipartHttpServletRequestBuilder author(MockMultipartHttpServletRequestBuilder request) {
        return request.header("X-Novel-Internal-Key", INTERNAL_KEY).header(TestBffSessions.HEADER, TestBffSessions.AUTHOR);
    }
}
