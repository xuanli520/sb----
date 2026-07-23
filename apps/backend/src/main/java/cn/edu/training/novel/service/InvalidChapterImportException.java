package cn.edu.training.novel.service;

/** The supplied manuscript cannot be accepted as a chapter import. */
public class InvalidChapterImportException extends RuntimeException {
    public InvalidChapterImportException(String message) {
        super(message);
    }

    public InvalidChapterImportException(String message, Throwable cause) {
        super(message, cause);
    }
}
