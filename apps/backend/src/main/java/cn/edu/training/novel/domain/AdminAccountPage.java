package cn.edu.training.novel.domain;

import java.util.List;

public record AdminAccountPage(List<AdminAccount> items, long total, int page, int size) {}
