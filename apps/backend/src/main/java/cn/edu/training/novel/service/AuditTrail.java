package cn.edu.training.novel.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditTrail {
    private final JdbcTemplate jdbcTemplate;
    private final List<String> recent = Collections.synchronizedList(new ArrayList<>());

    public AuditTrail(JdbcTemplate jdbcTemplate) { this.jdbcTemplate = jdbcTemplate; }

    public void record(String action) {
        String event = Instant.now() + " " + action;
        jdbcTemplate.update("INSERT INTO novel_audit_event(action, created_at) VALUES (?, CURRENT_TIMESTAMP)", event);
        recent.add(event);
    }

    public List<String> recent() { return List.copyOf(recent); }
}
