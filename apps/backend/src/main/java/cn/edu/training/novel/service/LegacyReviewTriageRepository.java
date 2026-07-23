package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.BookStatus;
import cn.edu.training.novel.domain.LegacyReviewTriageAction;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Write-only append log for recovery of rows produced by the retired NEEDS_REVIEW workflow. */
@Repository
public class LegacyReviewTriageRepository {
    private final JdbcTemplate jdbcTemplate;

    public LegacyReviewTriageRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void record(
            long bookId,
            LegacyReviewTriageAction action,
            BookStatus previousStatus,
            BookStatus status,
            String reason,
            long operatorUserId) {
        jdbcTemplate.update(
                "INSERT INTO novel_legacy_review_triage_audit("
                        + "book_id, action, previous_status, status, reason, operator_user_id, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
                bookId,
                action.name(),
                previousStatus.name(),
                status.name(),
                reason,
                operatorUserId);
    }
}
