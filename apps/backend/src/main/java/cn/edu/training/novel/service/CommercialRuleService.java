package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.CommercialRuleAudit;
import cn.edu.training.novel.domain.CommercialRules;
import cn.edu.training.novel.domain.Role;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Owns D-10 validation and the auditable update boundary for platform-wide commercial limits. */
@Service
public class CommercialRuleService {
    static final int MAX_MEMBERSHIP_DAYS_PER_CODE = 36_500;
    static final int MAX_RECOMMENDATION_VOTES_PER_DAY = 100;
    static final int MAX_MONTHLY_VOTES_PER_MONTH = 100;
    static final int MAX_REWARD_TOKENS_PER_REWARD = 1_000_000;
    static final int MAX_REWARD_TOKENS_PER_DAY = 5_000_000;

    private final CommercialRuleRepository repository;
    private final AuditTrail auditTrail;

    public CommercialRuleService(CommercialRuleRepository repository, AuditTrail auditTrail) {
        this.repository = repository;
        this.auditTrail = auditTrail;
    }

    public CommercialRules current() {
        return repository.current();
    }

    public List<CommercialRuleAudit> audits(CurrentUser actor, int limit) {
        actor.require(Role.ADMIN);
        if (limit < 1 || limit > 100) {
            throw badRequest("audit limit must be between 1 and 100");
        }
        return repository.audits(limit);
    }

    @Transactional
    public CommercialRules update(CurrentUser actor, UpdateCommand command) {
        actor.require(Role.ADMIN);
        String reason = requireReason(command.reason());
        CommercialRules requested = validated(command);
        CommercialRules previous = repository.lockCurrent();
        if (sameLimits(previous, requested)) {
            return previous;
        }
        repository.updateCurrent(requested, actor.id());
        CommercialRules updated = repository.current();
        repository.recordAudit(previous, updated, reason, actor.id());
        auditTrail.record("commercial-rules operator=" + actor.id()
                + " membershipDaysMaximum=" + updated.membershipDaysMaximumPerCode()
                + " recommendationVotesPerDay=" + updated.recommendationVotesPerDay()
                + " monthlyVotesPerMonth=" + updated.monthlyVotesPerMonth()
                + " rewardMin=" + updated.rewardMinimumTokens()
                + " rewardMax=" + updated.rewardMaximumTokensPerReward()
                + " rewardDailyMax=" + updated.rewardMaximumTokensPerDay());
        return updated;
    }

    private static CommercialRules validated(UpdateCommand command) {
        if (command.membershipDaysMaximumPerCode() < 1
                || command.membershipDaysMaximumPerCode() > MAX_MEMBERSHIP_DAYS_PER_CODE) {
            throw badRequest("membership days maximum is out of range");
        }
        if (command.recommendationVotesPerDay() < 0
                || command.recommendationVotesPerDay() > MAX_RECOMMENDATION_VOTES_PER_DAY) {
            throw badRequest("recommendation vote quota is out of range");
        }
        if (command.monthlyVotesPerMonth() < 0
                || command.monthlyVotesPerMonth() > MAX_MONTHLY_VOTES_PER_MONTH) {
            throw badRequest("monthly vote quota is out of range");
        }
        if (command.rewardMinimumTokens() < 1
                || command.rewardMinimumTokens() > MAX_REWARD_TOKENS_PER_REWARD) {
            throw badRequest("reward minimum is out of range");
        }
        if (command.rewardMaximumTokensPerReward() < command.rewardMinimumTokens()
                || command.rewardMaximumTokensPerReward() > MAX_REWARD_TOKENS_PER_REWARD) {
            throw badRequest("reward maximum per reward is out of range");
        }
        if (command.rewardMaximumTokensPerDay() < command.rewardMaximumTokensPerReward()
                || command.rewardMaximumTokensPerDay() > MAX_REWARD_TOKENS_PER_DAY) {
            throw badRequest("reward maximum per day is out of range");
        }
        // updatedAt is database-owned and never trusted from a request body.
        return new CommercialRules(
                command.membershipDaysMaximumPerCode(),
                command.recommendationVotesPerDay(),
                command.monthlyVotesPerMonth(),
                command.rewardMinimumTokens(),
                command.rewardMaximumTokensPerReward(),
                command.rewardMaximumTokensPerDay(),
                java.time.Instant.EPOCH);
    }

    private static boolean sameLimits(CommercialRules left, CommercialRules right) {
        return left.membershipDaysMaximumPerCode() == right.membershipDaysMaximumPerCode()
                && left.recommendationVotesPerDay() == right.recommendationVotesPerDay()
                && left.monthlyVotesPerMonth() == right.monthlyVotesPerMonth()
                && left.rewardMinimumTokens() == right.rewardMinimumTokens()
                && left.rewardMaximumTokensPerReward() == right.rewardMaximumTokensPerReward()
                && left.rewardMaximumTokensPerDay() == right.rewardMaximumTokensPerDay();
    }

    private static String requireReason(String value) {
        if (value == null || value.isBlank()) {
            throw badRequest("commercial rule change reason is required");
        }
        String normalized = value.trim().replace('\n', ' ').replace('\r', ' ');
        if (normalized.length() > 512) {
            throw badRequest("commercial rule change reason is too long");
        }
        return normalized;
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    public record UpdateCommand(
            int membershipDaysMaximumPerCode,
            int recommendationVotesPerDay,
            int monthlyVotesPerMonth,
            int rewardMinimumTokens,
            int rewardMaximumTokensPerReward,
            int rewardMaximumTokensPerDay,
            String reason) {}
}
