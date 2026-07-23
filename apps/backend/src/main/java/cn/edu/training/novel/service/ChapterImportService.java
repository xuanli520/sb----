package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.Chapter;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** Converts an author-owned TXT/DOCX manuscript into reviewable chapter drafts. */
@Service
public class ChapterImportService {
    private static final long MAX_IMPORT_BYTES = 5L * 1024 * 1024;
    private static final int MAX_CHAPTER_CHARACTERS = 20_000;
    private static final Pattern HEADING = Pattern.compile(
            "^\\s*(第[0-9零一二三四五六七八九十百千万两〇]+[章节回卷][^\\r\\n]{0,240})\\s*$");
    private final NovelStore store;

    public ChapterImportService(NovelStore store) {
        this.store = store;
    }

    @Transactional
    public ImportResult importFile(long authorId, long bookId, Long volumeId, MultipartFile file) {
        if (file == null || file.isEmpty()) throw new InvalidChapterImportException("import file is required");
        if (file.getSize() > MAX_IMPORT_BYTES) throw new InvalidChapterImportException("import file must not exceed 5 MiB");
        String filename = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().trim();
        String lower = filename.toLowerCase(Locale.ROOT);
        List<String> paragraphs;
        try {
            if (lower.endsWith(".txt")) paragraphs = txtParagraphs(file.getBytes());
            else if (lower.endsWith(".docx")) paragraphs = docxParagraphs(file);
            else throw new InvalidChapterImportException("only .txt and .docx files can be imported");
        } catch (IOException exception) {
            throw new InvalidChapterImportException("manuscript could not be read", exception);
        }
        List<ImportedDraft> drafts = draftsFrom(paragraphs);
        if (drafts.isEmpty()) throw new InvalidChapterImportException("manuscript contains no readable text");

        List<Chapter> created = new ArrayList<>(drafts.size());
        long wordCount = 0;
        for (ImportedDraft draft : drafts) {
            Chapter chapter = store.addChapter(authorId, bookId, volumeId, draft.title(), draft.content(), false);
            created.add(chapter);
            wordCount += draft.content().length();
        }
        return new ImportResult(created.size(), wordCount, created.stream()
                .map(chapter -> new ImportedChapter(chapter.id(), chapter.title(), chapter.orderNo()))
                .toList());
    }

    private static List<String> txtParagraphs(byte[] bytes) throws CharacterCodingException {
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException ignored) {
            text = java.nio.charset.Charset.forName("GB18030").decode(ByteBuffer.wrap(bytes)).toString();
        }
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        return paragraphs(text);
    }

    private static List<String> docxParagraphs(MultipartFile file) throws IOException {
        try (XWPFDocument document = new XWPFDocument(file.getInputStream())) {
            List<String> result = new ArrayList<>();
            document.getParagraphs().forEach(paragraph -> result.add(paragraph.getText()));
            return normalizeParagraphs(result);
        }
    }

    private static List<String> paragraphs(String text) {
        return normalizeParagraphs(List.of(text.replace("\r\n", "\n").replace('\r', '\n').split("\\n", -1)));
    }

    private static List<String> normalizeParagraphs(List<String> source) {
        List<String> result = new ArrayList<>();
        for (String paragraph : source) {
            if (paragraph == null) continue;
            String normalized = paragraph.replace("\r\n", "\n").replace('\r', '\n').trim();
            if (!normalized.isEmpty()) result.add(normalized);
        }
        return result;
    }

    private static List<ImportedDraft> draftsFrom(List<String> paragraphs) {
        List<ImportedDraft> drafts = new ArrayList<>();
        String title = "导入正文";
        List<String> content = new ArrayList<>();
        for (String paragraph : paragraphs) {
            var match = HEADING.matcher(paragraph);
            if (match.matches()) {
                appendDrafts(drafts, title, content);
                title = match.group(1).trim();
                content = new ArrayList<>();
            } else content.add(paragraph);
        }
        appendDrafts(drafts, title, content);
        return drafts;
    }

    private static void appendDrafts(List<ImportedDraft> drafts, String baseTitle, List<String> paragraphs) {
        if (paragraphs.isEmpty()) return;
        List<String> chunks = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String paragraph : paragraphs) {
            appendParagraphChunks(chunks, current, paragraph);
        }
        if (!current.isEmpty()) chunks.add(current.toString());
        for (int index = 0; index < chunks.size(); index++) {
            String title = chunks.size() == 1 ? baseTitle : baseTitle + "（" + (index + 1) + "/" + chunks.size() + "）";
            drafts.add(new ImportedDraft(title, chunks.get(index)));
        }
    }

    private static void appendParagraphChunks(List<String> chunks, StringBuilder current, String paragraph) {
        int cursor = 0;
        while (cursor < paragraph.length()) {
            int separatorLength = current.isEmpty() ? 0 : 2;
            int space = MAX_CHAPTER_CHARACTERS - current.length() - separatorLength;
            if (space <= 0) {
                chunks.add(current.toString());
                current.setLength(0);
                continue;
            }
            int take = Math.min(space, paragraph.length() - cursor);
            if (!current.isEmpty()) current.append("\n\n");
            current.append(paragraph, cursor, cursor + take);
            cursor += take;
            if (current.length() >= MAX_CHAPTER_CHARACTERS) {
                chunks.add(current.toString());
                current.setLength(0);
            }
        }
    }

    private record ImportedDraft(String title, String content) { }
    public record ImportedChapter(long id, String title, int orderNo) { }
    public record ImportResult(int createdChapterCount, long wordCount, List<ImportedChapter> chapters) { }
}
