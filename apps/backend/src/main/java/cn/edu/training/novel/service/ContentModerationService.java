package cn.edu.training.novel.service;

import cn.edu.training.novel.config.ContentModerationProperties;
import cn.edu.training.novel.domain.ContentModerationAudit;
import cn.edu.training.novel.domain.ModerationDecision;
import cn.edu.training.novel.domain.ModerationTrigger;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Local-first moderation workflow. It creates an audit row for every decision and deliberately
 * does not expose model text to the normal content lifecycle.
 */
@Service
public class ContentModerationService {
    public static final String CHAPTER = "CHAPTER";
    /** A proposed incremental edit. It deliberately has a distinct audit identity from live text. */
    public static final String CHAPTER_CANDIDATE = "CHAPTER_CANDIDATE";
    /** Clear audit type for immutable whole-work snapshot chunks, never a live chapter row. */
    public static final String BOOK_SNAPSHOT_CHUNK = "BOOK_SNAPSHOT_CHUNK";
    private static final String LOCAL_PROVIDER = "LOCAL_SENSITIVE_WORD";

    private final OperationsRepository operationsRepository;
    private final ContentModerationAuditRepository auditRepository;
    private final ContentModelModerationClient modelClient;
    private final ContentModerationProperties properties;

    public ContentModerationService(
            OperationsRepository operationsRepository,
            ContentModerationAuditRepository auditRepository,
            ContentModelModerationClient modelClient,
            ContentModerationProperties properties) {
        this.operationsRepository = operationsRepository;
        this.auditRepository = auditRepository;
        this.modelClient = modelClient;
        this.properties = properties;
    }

    public ContentModerationAudit moderateChapter(
            long chapterId, String title, String content, ModerationTrigger trigger) {
        return persistPrepared(prepareModeration(
                CHAPTER,
                chapterId,
                chapterContentVersionHash(title, content),
                title,
                content,
                trigger));
    }

    /** Screens an immutable candidate without making its text part of the public chapter row. */
    public ContentModerationAudit moderateChapterCandidate(
            long candidateId, String title, String content, ModerationTrigger trigger) {
        return persistPrepared(prepareModeration(
                CHAPTER_CANDIDATE,
                candidateId,
                chapterCandidateContentVersionHash(title, content),
                title,
                content,
                trigger));
    }

    /**
     * Evaluates an immutable snapshot chunk without persisting or holding a database lock. The
     * worker persists the returned audit only after it proves that its claim token is still active.
     */
    ContentModerationAudit prepareSnapshotChunk(
            long snapshotChunkId, String contentHash, String title, String content) {
        return prepareModeration(
                BOOK_SNAPSHOT_CHUNK,
                snapshotChunkId,
                contentHash,
                title,
                content,
                ModerationTrigger.BOOK_SNAPSHOT);
    }

    /** A bounded snapshot rejection is auditable but intentionally never sent to a model. */
    ContentModerationAudit prepareSnapshotBoundaryFailure(
            long snapshotChunkId, String contentHash, int inputCharacters) {
        Instant now = Instant.now();
        return new ContentModerationAudit(
                0,
                BOOK_SNAPSHOT_CHUNK,
                snapshotChunkId,
                contentHash,
                ModerationTrigger.BOOK_SNAPSHOT,
                "SNAPSHOT_BOUNDARY",
                null,
                ModerationDecision.MODEL_ERROR,
                "Full-work snapshot exceeded the configured safety bound; human review is required.",
                properties.policyVersion(),
                properties.promptVersion(),
                Math.max(0, inputCharacters),
                UUID.randomUUID().toString(),
                null,
                "snapshot-input-bound-exceeded",
                false,
                now,
                now);
    }

    /** Persists a previously evaluated audit inside the caller's short database transaction. */
    ContentModerationAudit persistPrepared(ContentModerationAudit audit) {
        return auditRepository.save(audit);
    }

    private ContentModerationAudit prepareModeration(
            String contentType,
            long contentId,
            String contentHash,
            String title,
            String content,
            ModerationTrigger trigger) {
        String normalizedTitle = title == null ? "" : title;
        String normalizedContent = content == null ? "" : content;
        int inputCharacters = normalizedTitle.length() + normalizedContent.length();
        Instant startedAt = Instant.now();

        if (inputCharacters > properties.maxInputCharacters()) {
            return new ContentModerationAudit(
                    0,
                    contentType,
                    contentId,
                    contentHash,
                    trigger,
                    "LOCAL_POLICY",
                    null,
                    ModerationDecision.MODEL_ERROR,
                    "Content exceeded the configured moderation input bound; automatic publication is withheld.",
                    properties.policyVersion(),
                    properties.promptVersion(),
                    inputCharacters,
                    UUID.randomUUID().toString(),
                    null,
                    "input-bound-exceeded",
                    false,
                    startedAt,
                    Instant.now());
        }

        // This remains the first-line screen even when a Qwen client is configured.
        if (operationsRepository.containsSensitiveWord(normalizedTitle + "\n" + normalizedContent)) {
            return new ContentModerationAudit(
                    0,
                    contentType,
                    contentId,
                    contentHash,
                    trigger,
                    LOCAL_PROVIDER,
                    null,
                    ModerationDecision.LOCAL_SENSITIVE_WORD,
                    "Local sensitive-word policy matched; automatic publication is withheld.",
                    properties.policyVersion(),
                    properties.promptVersion(),
                    inputCharacters,
                    UUID.randomUUID().toString(),
                    null,
                    null,
                    false,
                    startedAt,
                    Instant.now());
        }

        ModelModerationResult result;
        try {
            result = modelClient.moderate(new ContentModerationRequest(
                    contentType,
                    contentId,
                    contentHash,
                    normalizedTitle,
                    normalizedContent,
                    trigger,
                    properties.policyVersion(),
                    properties.promptVersion()));
        } catch (RuntimeException exception) {
            result = ModelModerationResult.error(
                    "MODEL_BOUNDARY",
                    null,
                    "Content moderation failed; automatic publication is withheld.",
                    ContentModerationSanitizer.safeExceptionSummary(exception),
                    UUID.randomUUID().toString(),
                    startedAt);
        }
        return fromModelResult(contentType, contentId, contentHash, trigger, inputCharacters, startedAt, result);
    }

    /** Canonical version hash shared by moderation and the human-review evidence linker. */
    public static String chapterContentVersionHash(String title, String content) {
        return contentVersionHash(CHAPTER, title, content);
    }

    /** Candidate hashes are not interchangeable with the live chapter's hash. */
    public static String chapterCandidateContentVersionHash(String title, String content) {
        return contentVersionHash(CHAPTER_CANDIDATE, title, content);
    }

    /** Canonical hash for an immutable snapshot chunk, separate from a live chapter version. */
    public static String snapshotChunkContentVersionHash(String title, String content) {
        return contentVersionHash(BOOK_SNAPSHOT_CHUNK, title, content);
    }

    public List<ContentModerationAudit> recentAudits(String contentType, int limit) {
        return auditRepository.findRecent(contentType, limit);
    }

    private ContentModerationAudit fromModelResult(
            String contentType,
            long contentId,
            String contentHash,
            ModerationTrigger trigger,
            int inputCharacters,
            Instant fallbackStartedAt,
            ModelModerationResult result) {
        if (result == null) {
            result = ModelModerationResult.error(
                    "MODEL_BOUNDARY",
                    null,
                    "Content moderation returned no result; automatic publication is withheld.",
                    "null-result",
                    UUID.randomUUID().toString(),
                    fallbackStartedAt);
        }
        ModerationDecision decision = normalizeDecision(result.decision(), result.simulated());
        Instant startedAt = result.startedAt() == null ? fallbackStartedAt : result.startedAt();
        Instant completedAt = result.completedAt() == null ? Instant.now() : result.completedAt();
        if (completedAt.isBefore(startedAt)) {
            completedAt = startedAt;
        }
        String rawResponse = decision == ModerationDecision.INVALID_OUTPUT
                ? ContentModerationSanitizer.digestMarker(result.rawResponse())
                : ContentModerationSanitizer.bounded(result.rawResponse(), properties.maxResponseCharacters());
        return new ContentModerationAudit(
                0,
                contentType,
                contentId,
                contentHash,
                trigger,
                nonBlank(result.provider(), "MODEL_BOUNDARY", 64),
                ContentModerationSanitizer.bounded(result.model(), 255),
                decision,
                nonBlank(result.reason(), "Content moderation requires human review.", 1024),
                properties.policyVersion(),
                properties.promptVersion(),
                inputCharacters,
                nonBlank(result.requestId(), UUID.randomUUID().toString(), 128),
                rawResponse,
                ContentModerationSanitizer.bounded(result.errorSummary(), 1024),
                result.simulated() && decision == ModerationDecision.SIMULATED_PASS,
                startedAt,
                completedAt);
    }

    private static ModerationDecision normalizeDecision(ModerationDecision decision, boolean simulated) {
        if (simulated && decision == ModerationDecision.SIMULATED_PASS) {
            return ModerationDecision.SIMULATED_PASS;
        }
        if (decision == ModerationDecision.PASS
                || decision == ModerationDecision.MANUAL_REVIEW
                || decision == ModerationDecision.REJECT
                || decision == ModerationDecision.MODEL_UNAVAILABLE
                || decision == ModerationDecision.MODEL_ERROR
                || decision == ModerationDecision.INVALID_OUTPUT) {
            return decision;
        }
        return ModerationDecision.INVALID_OUTPUT;
    }

    private static String nonBlank(String value, String fallback, int limit) {
        String bounded = ContentModerationSanitizer.bounded(value, limit);
        return bounded == null || bounded.isBlank() ? fallback : bounded;
    }

    private static String contentVersionHash(String contentType, String title, String content) {
        String normalizedTitle = title == null ? "" : title;
        String normalizedContent = content == null ? "" : content;
        return ContentModerationSanitizer.sha256(contentType + "\n" + normalizedTitle + "\n" + normalizedContent);
    }
}
