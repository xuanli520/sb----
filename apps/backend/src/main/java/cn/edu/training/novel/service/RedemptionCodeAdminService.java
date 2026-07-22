package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.GeneratedRedemptionCodeBatch;
import cn.edu.training.novel.domain.ManagedRedemptionCode;
import cn.edu.training.novel.domain.RedemptionCodePage;
import cn.edu.training.novel.domain.Role;
import cn.edu.training.novel.domain.CommercialRules;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.NoSuchElementException;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Administrative lifecycle for bearer-like redemption codes. Audit rows deliberately retain batch
 * metadata rather than raw code values so the audit log is not another source of redeemable
 * secrets.
 */
@Service
public class RedemptionCodeAdminService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final Pattern CODE_PATTERN = Pattern.compile("^[A-Z0-9][A-Z0-9-]{3,63}$");
    private static final Pattern BATCH_PATTERN = Pattern.compile("^[A-Z0-9][A-Z0-9-]{0,63}$");
    private static final Pattern PREFIX_PATTERN = Pattern.compile("^[A-Z0-9][A-Z0-9-]{0,19}$");
    private static final int MAX_BATCH_QUANTITY = 1_000;
    private static final int MAX_MEMBERSHIP_DAYS = 36_500;

    private final WalletRepository walletRepository;
    private final CatalogRepository catalogRepository;
    private final CommercialRuleService commercialRuleService;
    private final AuditTrail auditTrail;

    public RedemptionCodeAdminService(
            WalletRepository walletRepository,
            CatalogRepository catalogRepository,
            CommercialRuleService commercialRuleService,
            AuditTrail auditTrail) {
        this.walletRepository = walletRepository;
        this.catalogRepository = catalogRepository;
        this.commercialRuleService = commercialRuleService;
        this.auditTrail = auditTrail;
    }

    public RedemptionCodePage list(
            CurrentUser actor,
            String codeQuery,
            String batchNo,
            String benefitType,
            String status,
            int page,
            int size) {
        requireAdministrator(actor);
        if (page < 0 || size < 1 || size > 100) {
            throw badRequest("page or size is out of range");
        }
        int offset;
        try {
            offset = Math.multiplyExact(page, size);
        } catch (ArithmeticException exception) {
            throw badRequest("page is out of range");
        }
        String normalizedBatch = optionalBatchNo(batchNo);
        String normalizedBenefitType = optionalBenefitType(benefitType);
        String normalizedStatus = optionalStatus(status);
        String normalizedCodeQuery = codeQuery == null || codeQuery.isBlank()
                ? null
                : codeQuery.trim().toUpperCase(Locale.ROOT);
        WalletRepository.ManagedCodeFilter filter = new WalletRepository.ManagedCodeFilter(
                normalizedCodeQuery,
                normalizedBatch,
                normalizedBenefitType,
                normalizedStatus,
                size,
                offset);
        Instant now = Instant.now();
        List<ManagedRedemptionCode> items = walletRepository.findManagedRedemptionCodes(filter).stream()
                .map(code -> withEffectiveStatus(code, now))
                .toList();
        return new RedemptionCodePage(items, page, size, walletRepository.countManagedRedemptionCodes(filter));
    }

    @Transactional
    public GeneratedRedemptionCodeBatch generate(CurrentUser actor, GenerateCommand command) {
        requireAdministrator(actor);
        int quantity = requireQuantity(command.quantity());
        Benefits benefits = validateBenefits(
                command.tokenAmount(), command.membershipDays(), command.bookId(), command.expiresAt());
        String batchNo = generatedOrExplicitBatchNo(command.batchNo());
        String prefix = codePrefix(command.codePrefix());
        List<ManagedRedemptionCode> codes = new ArrayList<>(quantity);
        for (int index = 0; index < quantity; index++) {
            codes.add(createGeneratedCode(actor.id(), batchNo, prefix, benefits));
        }
        auditTrail.record("admin redemption-code generate batch=" + batchNo + " quantity=" + quantity + " user=" + actor.id());
        return new GeneratedRedemptionCodeBatch(batchNo, List.copyOf(codes));
    }

    @Transactional
    public ManagedRedemptionCode importCode(CurrentUser actor, ImportCommand command) {
        requireAdministrator(actor);
        String code = normalizedCode(command.code());
        String batchNo = requiredBatchNo(command.batchNo());
        Benefits benefits = validateBenefits(
                command.tokenAmount(), command.membershipDays(), command.bookId(), command.expiresAt());
        if (walletRepository.findManagedRedemptionCode(code).isPresent()) {
            throw conflict("redemption code already exists");
        }
        try {
            walletRepository.createManagedRedemptionCode(
                    code,
                    batchNo,
                    benefits.type(),
                    benefits.tokenAmount(),
                    benefits.bookId(),
                    benefits.membershipDays(),
                    benefits.expiresAt(),
                    actor.id());
        } catch (DataIntegrityViolationException exception) {
            // The preflight only optimizes the common path; the primary key remains the race-safe
            // idempotency boundary for concurrently imported codes.
            if (walletRepository.findManagedRedemptionCode(code).isPresent()) {
                throw conflict("redemption code already exists");
            }
            throw exception;
        }
        ManagedRedemptionCode imported = walletRepository.findManagedRedemptionCode(code)
                .orElseThrow(() -> new IllegalStateException("redemption code was not imported"));
        auditTrail.record("admin redemption-code import batch=" + batchNo + " codeSuffix=" + codeSuffix(code) + " user=" + actor.id());
        return imported;
    }

    @Transactional
    public ManagedRedemptionCode disable(CurrentUser actor, String rawCode, String reason) {
        requireAdministrator(actor);
        String code = normalizedCode(rawCode);
        ManagedRedemptionCode current = walletRepository.findManagedRedemptionCode(code)
                .orElseThrow(() -> new NoSuchElementException("redemption code not found"));
        if (!walletRepository.disableUnusedRedemptionCode(code, actor.id())) {
            throw conflict(current.redeemedAt() != null || "REDEEMED".equals(current.status())
                    ? "redeemed redemption code cannot be disabled"
                    : "redemption code is already disabled");
        }
        ManagedRedemptionCode disabled = walletRepository.findManagedRedemptionCode(code)
                .orElseThrow(() -> new IllegalStateException("redemption code was not disabled"));
        String normalizedReason = auditReason(reason);
        auditTrail.record("admin redemption-code disable codeSuffix=" + codeSuffix(code)
                + " user=" + actor.id() + (normalizedReason.isEmpty() ? "" : " reason=" + normalizedReason));
        return disabled;
    }

    private ManagedRedemptionCode createGeneratedCode(long adminUserId, String batchNo, String prefix, Benefits benefits) {
        for (int attempts = 0; attempts < 20; attempts++) {
            String code = prefix + "-" + randomCharacters(16);
            if (walletRepository.findManagedRedemptionCode(code).isPresent()) {
                continue;
            }
            try {
                walletRepository.createManagedRedemptionCode(
                        code,
                        batchNo,
                        benefits.type(),
                        benefits.tokenAmount(),
                        benefits.bookId(),
                        benefits.membershipDays(),
                        benefits.expiresAt(),
                        adminUserId);
                return walletRepository.findManagedRedemptionCode(code)
                        .orElseThrow(() -> new IllegalStateException("generated redemption code was not persisted"));
            } catch (DataIntegrityViolationException collision) {
                // A unique-key collision is harmless here: generate a fresh opaque code instead.
                // Do not hide another database constraint failure as a collision.
                if (walletRepository.findManagedRedemptionCode(code).isEmpty()) {
                    throw collision;
                }
            }
        }
        throw new IllegalStateException("could not allocate a unique redemption code");
    }

    private Benefits validateBenefits(Long rawTokenAmount, Integer rawMembershipDays, Long rawBookId, Instant expiresAt) {
        long tokenAmount = rawTokenAmount == null ? 0 : rawTokenAmount;
        int membershipDays = rawMembershipDays == null ? 0 : rawMembershipDays;
        if (tokenAmount < 0 || tokenAmount > Integer.MAX_VALUE) {
            throw badRequest("token amount is out of range");
        }
        if (membershipDays < 0 || membershipDays > MAX_MEMBERSHIP_DAYS) {
            throw badRequest("membership days is out of range");
        }
        CommercialRules rules = commercialRuleService.current();
        if (membershipDays > rules.membershipDaysMaximumPerCode()) {
            throw badRequest("membership days exceeds the configured per-code maximum");
        }
        if (rawBookId != null) {
            if (rawBookId <= 0) {
                throw badRequest("book id must be positive");
            }
            if (catalogRepository.findById(rawBookId).isEmpty()) {
                throw new NoSuchElementException("book not found");
            }
        }
        if (tokenAmount == 0 && membershipDays == 0 && rawBookId == null) {
            throw badRequest("at least one redemption benefit is required");
        }
        if (expiresAt != null && !expiresAt.isAfter(Instant.now())) {
            throw badRequest("redemption code expiry must be in the future");
        }
        int benefitCount = (tokenAmount > 0 ? 1 : 0) + (membershipDays > 0 ? 1 : 0) + (rawBookId != null ? 1 : 0);
        String type;
        if (benefitCount > 1) {
            type = "COMPOSITE";
        } else if (tokenAmount > 0) {
            type = "TOKEN";
        } else if (membershipDays > 0) {
            type = "MEMBERSHIP";
        } else {
            type = "BOOK";
        }
        return new Benefits(tokenAmount, membershipDays, rawBookId, expiresAt, type);
    }

    private static int requireQuantity(Integer quantity) {
        if (quantity == null || quantity < 1 || quantity > MAX_BATCH_QUANTITY) {
            throw badRequest("generation quantity must be between 1 and " + MAX_BATCH_QUANTITY);
        }
        return quantity;
    }

    private static String generatedOrExplicitBatchNo(String value) {
        return value == null || value.isBlank() ? "BATCH-" + randomCharacters(12) : requiredBatchNo(value);
    }

    private static String requiredBatchNo(String value) {
        String normalized = optionalBatchNo(value);
        if (normalized == null) {
            throw badRequest("batch number is required");
        }
        return normalized;
    }

    private static String optionalBatchNo(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!BATCH_PATTERN.matcher(normalized).matches()) {
            throw badRequest("batch number format is invalid");
        }
        return normalized;
    }

    private static String codePrefix(String value) {
        if (value == null || value.isBlank()) {
            return "NVC";
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!PREFIX_PATTERN.matcher(normalized).matches() || normalized.endsWith("-")) {
            throw badRequest("code prefix format is invalid");
        }
        return normalized;
    }

    private static String normalizedCode(String value) {
        if (value == null || value.isBlank()) {
            throw badRequest("redemption code is required");
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!CODE_PATTERN.matcher(normalized).matches()) {
            throw badRequest("redemption code format is invalid");
        }
        return normalized;
    }

    private static String optionalBenefitType(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!List.of("TOKEN", "MEMBERSHIP", "BOOK", "COMPOSITE").contains(normalized)) {
            throw badRequest("unsupported redemption benefit type");
        }
        return normalized;
    }

    private static String optionalStatus(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!List.of("ACTIVE", "EXPIRED", "REDEEMED", "DISABLED").contains(normalized)) {
            throw badRequest("unsupported redemption-code status");
        }
        return normalized;
    }

    private static ManagedRedemptionCode withEffectiveStatus(ManagedRedemptionCode code, Instant now) {
        if ("ACTIVE".equals(code.status()) && code.expiresAt() != null && !code.expiresAt().isAfter(now)) {
            return code.withStatus("EXPIRED");
        }
        return code;
    }

    private static String randomCharacters(int length) {
        char[] value = new char[length];
        for (int index = 0; index < value.length; index++) {
            value[index] = CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)];
        }
        return new String(value);
    }

    private static String codeSuffix(String code) {
        return code.substring(Math.max(0, code.length() - 4));
    }

    private static String auditReason(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.trim().replace('\n', ' ').replace('\r', ' ');
        return normalized.length() <= 256 ? normalized : normalized.substring(0, 256);
    }

    private static void requireAdministrator(CurrentUser actor) {
        actor.require(Role.ADMIN);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }

    public record GenerateCommand(
            Integer quantity,
            String batchNo,
            String codePrefix,
            Long tokenAmount,
            Integer membershipDays,
            Long bookId,
            Instant expiresAt) {}

    public record ImportCommand(
            String code,
            String batchNo,
            Long tokenAmount,
            Integer membershipDays,
            Long bookId,
            Instant expiresAt) {}

    private record Benefits(long tokenAmount, int membershipDays, Long bookId, Instant expiresAt, String type) {}
}
