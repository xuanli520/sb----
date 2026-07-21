package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.ModerationTrigger;

/** Immutable content snapshot handed to a model client after local vocabulary screening passed. */
public record ContentModerationRequest(
        String contentType,
        long contentId,
        String contentVersionHash,
        String title,
        String content,
        ModerationTrigger trigger,
        String policyVersion,
        String promptVersion) {
}
