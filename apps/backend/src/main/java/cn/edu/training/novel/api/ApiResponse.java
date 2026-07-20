package cn.edu.training.novel.api;

public record ApiResponse<T>(int code, String msg, T data) {
    public static <T> ApiResponse<T> ok(T data) { return new ApiResponse<>(200, "ok", data); }
}
