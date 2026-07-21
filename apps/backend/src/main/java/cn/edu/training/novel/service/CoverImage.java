package cn.edu.training.novel.service;

/** A validated, decoded cover image. Its bytes and type are derived from image data, not a filename. */
public record CoverImage(byte[] bytes, String contentType, String extension, int width, int height) { }
