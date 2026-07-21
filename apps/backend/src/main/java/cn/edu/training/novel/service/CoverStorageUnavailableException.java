package cn.edu.training.novel.service;

/** A clean, retryable failure when optional object storage is disabled, incomplete, or unreachable. */
public class CoverStorageUnavailableException extends RuntimeException {
    public CoverStorageUnavailableException(String message) { super(message); }
    public CoverStorageUnavailableException(String message, Throwable cause) { super(message, cause); }
}
