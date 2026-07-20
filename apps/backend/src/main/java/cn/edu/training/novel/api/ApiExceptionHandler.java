package cn.edu.training.novel.api;

import java.util.NoSuchElementException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice
class ApiExceptionHandler {
    @ExceptionHandler({NoSuchElementException.class, IllegalArgumentException.class})
    @ResponseStatus(HttpStatus.NOT_FOUND)
    ApiResponse<Void> notFound(Exception e) { return new ApiResponse<>(404, e.getMessage(), null); }
    @ExceptionHandler({IllegalStateException.class})
    @ResponseStatus(HttpStatus.CONFLICT)
    ApiResponse<Void> conflict(Exception e) { return new ApiResponse<>(409, e.getMessage(), null); }
    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    ApiResponse<Void> forbidden(Exception e) { return new ApiResponse<>(403, e.getMessage(), null); }
}
