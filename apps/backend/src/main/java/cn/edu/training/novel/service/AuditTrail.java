package cn.edu.training.novel.service;

import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditTrail {
    private final JdbcTemplate jdbcTemplate;

    public AuditTrail(JdbcTemplate jdbcTemplate) { this.jdbcTemplate = jdbcTemplate; }

    public void record(String action) {
        String event = Instant.now() + " " + action;
        jdbcTemplate.update("INSERT INTO novel_audit_event(action, created_at) VALUES (?, CURRENT_TIMESTAMP)", event);
    }

    /**
     * The operations screen is intentionally backed by the append-only table rather than a JVM
     * cache, so an application restart does not erase the audit history visible to an operator.
     */
    public List<String> recent() {
        return jdbcTemplate.query(
                "SELECT action FROM novel_audit_event ORDER BY created_at DESC, id DESC LIMIT 100",
                (resultSet, rowNumber) -> resultSet.getString("action"));
    }
}
