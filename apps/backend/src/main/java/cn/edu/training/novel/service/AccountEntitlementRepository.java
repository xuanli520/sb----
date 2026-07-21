package cn.edu.training.novel.service;

import cn.edu.training.novel.domain.AccountEntitlements;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AccountEntitlementRepository {
    private static final String TOKEN_UNIT = "TOKEN";

    private final JdbcTemplate jdbc;

    public AccountEntitlementRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public AccountEntitlements findForUser(long userId, Instant now) {
        List<AccountEntitlements.Membership> memberships = jdbc.query(
                "SELECT expires_at FROM novel_membership_entitlement WHERE user_id = ?",
                (resultSet, rowNumber) -> {
                    Instant expiresAt = toInstant(resultSet.getTimestamp("expires_at"));
                    return new AccountEntitlements.Membership(expiresAt, expiresAt.isAfter(now));
                },
                userId);
        List<AccountEntitlements.Book> books = jdbc.query(
                "SELECT entitlement.book_id, book.title, entitlement.source_type, entitlement.source_reference, "
                        + "entitlement.purchase_amount, entitlement.acquired_at "
                        + "FROM novel_book_entitlement entitlement "
                        + "JOIN novel_book book ON book.id = entitlement.book_id "
                        + "WHERE entitlement.user_id = ? "
                        + "ORDER BY entitlement.acquired_at DESC, entitlement.book_id ASC",
                (resultSet, rowNumber) -> new AccountEntitlements.Book(
                        resultSet.getLong("book_id"),
                        resultSet.getString("title"),
                        resultSet.getString("source_type"),
                        resultSet.getString("source_reference"),
                        resultSet.getLong("purchase_amount"),
                        TOKEN_UNIT,
                        toInstant(resultSet.getTimestamp("acquired_at"))),
                userId);
        return new AccountEntitlements(memberships.stream().findFirst().orElse(null), books);
    }

    private static Instant toInstant(Timestamp value) {
        return value.toInstant();
    }
}
