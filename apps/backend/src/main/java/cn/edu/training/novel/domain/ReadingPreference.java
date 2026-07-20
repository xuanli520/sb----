package cn.edu.training.novel.domain;

public record ReadingPreference(String theme, String font, int fontSize, int lineHeight, int brightness, String pageMode) {
    public static ReadingPreference defaults() { return new ReadingPreference("paper", "serif", 19, 190, 85, "slide"); }
}
