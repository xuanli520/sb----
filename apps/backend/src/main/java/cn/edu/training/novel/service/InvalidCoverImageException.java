package cn.edu.training.novel.service;

/** A client-correctable image upload failure. */
public class InvalidCoverImageException extends RuntimeException {
    public InvalidCoverImageException(String message) { super(message); }
    public InvalidCoverImageException(String message, Throwable cause) { super(message, cause); }
}
