package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AccountStatusAudit;
import cn.edu.training.novel.domain.AccountStatusChange;
import cn.edu.training.novel.domain.AdminAccount;
import cn.edu.training.novel.domain.AdminAccountPage;
import cn.edu.training.novel.domain.OperatingTaxonomyAudit;
import cn.edu.training.novel.domain.OperatingTaxonomyItem;
import cn.edu.training.novel.domain.Role;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Coordinates audited, transactional operations that are reserved for platform administrators. */
@Service
public class AdminOperationsService {
    private final AdminOperationsRepository repository;
    private final AuditTrail auditTrail;

    public AdminOperationsService(AdminOperationsRepository repository, AuditTrail auditTrail) {
        this.repository = repository;
        this.auditTrail = auditTrail;
    }

    public AdminAccountPage accounts(String query, String status, String role, int page, int size) {
        if (query != null && query.trim().length() > 128) {
            throw new IllegalArgumentException("account query is too long");
        }
        AdminOperationsRepository.AccountFilter filter = new AdminOperationsRepository.AccountFilter(
                parseEnabled(status), parseRole(role));
        return new AdminAccountPage(
                repository.findAccounts(query, filter, size, Math.multiplyExact(page, size)),
                repository.countAccounts(query, filter),
                page,
                size);
    }

    public List<AccountStatusAudit> accountStatusAudits(long accountId, int limit) {
        requireExistingAccount(accountId);
        return repository.findAccountStatusAudits(accountId, limit);
    }

    @Transactional
    public AccountStatusChange changeAccountStatus(
            long operatorUserId,
            long accountId,
            boolean enabled,
            String reason) {
        String normalizedReason = requireReason(reason);
        List<AdminAccount> enabledAdministrators = repository.lockEnabledAdministrators();
        AdminAccount existing = repository.lockAccount(accountId)
                .orElseThrow(() -> new java.util.NoSuchElementException("account not found"));
        if (existing.enabled() == enabled) {
            return new AccountStatusChange(existing.id(), existing.enabled(), existing, false, null);
        }
        // Development principals use fixed demonstration ids. Only an administrator target can
        // represent a real self-suspension, so a reader whose generated id happens to match is safe.
        if (!enabled && operatorUserId == accountId && existing.roles().contains(Role.ADMIN)) {
            throw new IllegalStateException("current administrator cannot suspend their own account");
        }
        if (!enabled && existing.roles().contains(Role.ADMIN)
                && (enabledAdministrators.size() <= 1
                || enabledAdministrators.stream().noneMatch(administrator -> administrator.id() == accountId))) {
            throw new IllegalStateException("cannot suspend the last enabled administrator");
        }

        AdminAccount saved = repository.updateAccountEnabled(accountId, enabled);
        if (!enabled) {
            repository.revokeOpenLoginSessions(accountId);
        }
        AccountStatusAudit audit = repository.recordAccountStatusAudit(
                accountId,
                existing.enabled(),
                enabled,
                normalizedReason,
                operatorUserId);
        auditTrail.record("account-status operator=" + operatorUserId + " account=" + accountId
                + " previousEnabled=" + existing.enabled() + " enabled=" + enabled);
        return new AccountStatusChange(saved.id(), saved.enabled(), saved, true, audit);
    }

    public List<OperatingTaxonomyItem> taxonomy(String type) {
        return repository.findTaxonomy(parseTaxonomyType(type));
    }

    /** Public discovery only receives items that are currently enabled by an administrator. */
    public List<OperatingTaxonomyItem> activeTaxonomy(String type) {
        return repository.findEnabledTaxonomy(parseTaxonomyType(type));
    }

    public List<OperatingTaxonomyAudit> taxonomyAudits(String type, int limit) {
        return repository.findTaxonomyAudits(parseTaxonomyType(type), limit);
    }

    @Transactional
    public OperatingTaxonomyItem createTaxonomy(
            long operatorUserId,
            String type,
            String name,
            boolean enabled,
            int sortOrder) {
        AdminOperationsRepository.TaxonomyType taxonomyType = parseTaxonomyType(type);
        String normalizedName = normalizeTaxonomyName(name);
        OperatingTaxonomyItem created = repository.createTaxonomy(
                taxonomyType,
                normalizedName,
                name.trim(),
                enabled,
                sortOrder,
                operatorUserId);
        String details = taxonomyDetails(created);
        repository.recordTaxonomyAudit(created.id(), taxonomyType, "CREATED", details, operatorUserId);
        auditTrail.record("taxonomy-created operator=" + operatorUserId + " type=" + taxonomyType.name()
                + " id=" + created.id());
        return created;
    }

    @Transactional
    public OperatingTaxonomyItem updateTaxonomy(
            long operatorUserId,
            long taxonomyId,
            String type,
            String name,
            boolean enabled,
            int sortOrder) {
        AdminOperationsRepository.TaxonomyType taxonomyType = parseTaxonomyType(type);
        repository.lockTaxonomy(taxonomyId, taxonomyType)
                .orElseThrow(() -> new java.util.NoSuchElementException(taxonomyType.displayName() + " not found"));
        String normalizedName = normalizeTaxonomyName(name);
        OperatingTaxonomyItem updated = repository.updateTaxonomy(
                taxonomyId,
                taxonomyType,
                normalizedName,
                name.trim(),
                enabled,
                sortOrder,
                operatorUserId);
        String details = taxonomyDetails(updated);
        repository.recordTaxonomyAudit(updated.id(), taxonomyType, "UPDATED", details, operatorUserId);
        auditTrail.record("taxonomy-updated operator=" + operatorUserId + " type=" + taxonomyType.name()
                + " id=" + updated.id());
        return updated;
    }

    private void requireExistingAccount(long accountId) {
        if (repository.findAccount(accountId).isEmpty()) {
            throw new java.util.NoSuchElementException("account not found");
        }
    }

    private static Boolean parseEnabled(String status) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) {
            return null;
        }
        return switch (status.trim().toUpperCase(Locale.ROOT)) {
            case "ENABLED" -> true;
            case "SUSPENDED" -> false;
            default -> throw new IllegalArgumentException("account status must be ENABLED, SUSPENDED, or ALL");
        };
    }

    private static Role parseRole(String role) {
        if (role == null || role.isBlank() || "ALL".equalsIgnoreCase(role)) {
            return null;
        }
        try {
            return Role.valueOf(role.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("unknown account role");
        }
    }

    private static AdminOperationsRepository.TaxonomyType parseTaxonomyType(String type) {
        if (type == null || type.isBlank()) {
            throw new IllegalArgumentException("taxonomy type is required");
        }
        try {
            return AdminOperationsRepository.TaxonomyType.valueOf(type.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("taxonomy type must be CATEGORY or TAG");
        }
    }

    private static String requireReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new IllegalArgumentException("account status reason is required");
        }
        String normalized = reason.trim();
        if (normalized.length() > 1024) {
            throw new IllegalArgumentException("account status reason is too long");
        }
        return normalized;
    }

    private static String normalizeTaxonomyName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("taxonomy name is required");
        }
        String normalized = name.trim();
        if (normalized.length() > 128) {
            throw new IllegalArgumentException("taxonomy name is too long");
        }
        return normalized.toLowerCase(Locale.ROOT);
    }

    private static String taxonomyDetails(OperatingTaxonomyItem item) {
        return "name=" + item.name() + " enabled=" + item.enabled() + " sortOrder=" + item.sortOrder();
    }
}
