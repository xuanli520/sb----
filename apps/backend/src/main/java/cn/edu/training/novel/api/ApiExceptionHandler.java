package cn.edu.training.novel.api;

import cn.edu.training.novel.service.CoverStorageUnavailableException;
import cn.edu.training.novel.service.InvalidCoverImageException;
import java.util.NoSuchElementException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler(InvalidCoverImageException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ApiResponse<Void> invalidCover(InvalidCoverImageException exception) { return new ApiResponse<>(400, exception.getMessage(), null); }
    @ExceptionHandler({MissingServletRequestPartException.class, MaxUploadSizeExceededException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ApiResponse<Void> invalidMultipart(Exception exception) { return new ApiResponse<>(400, "cover image upload is invalid or too large", null); }
    @ExceptionHandler(CoverStorageUnavailableException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    ApiResponse<Void> coverStorageUnavailable(CoverStorageUnavailableException exception) { return new ApiResponse<>(503, exception.getMessage(), null); }
    @ExceptionHandler({NoSuchElementException.class, IllegalArgumentException.class})
    @ResponseStatus(HttpStatus.NOT_FOUND)
    ApiResponse<Void> notFound(Exception e) { return new ApiResponse<>(404, e.getMessage(), null); }
    @ExceptionHandler({IllegalStateException.class})
    @ResponseStatus(HttpStatus.CONFLICT)
    ApiResponse<Void> conflict(Exception e) { return new ApiResponse<>(409, e.getMessage(), null); }
    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    ApiResponse<Void> forbidden(Exception e) { return new ApiResponse<>(403, e.getMessage(), null); }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ApiResponse<Void> invalidRequest(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + " " + error.getDefaultMessage())
                .orElse("invalid request");
        return new ApiResponse<>(400, message, null);
    }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiResponse<Void>> responseStatus(ResponseStatusException exception) {
        int status = exception.getStatusCode().value();
        String message = exception.getReason() == null ? "request failed" : exception.getReason();
        return ResponseEntity.status(exception.getStatusCode()).body(new ApiResponse<>(status, message, null));
    }
}
