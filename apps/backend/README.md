# Backend Database Tests

`mvn --batch-mode --no-transfer-progress test` remains the deterministic H2-backed test suite and does not require Docker.

Run the opt-in MySQL/Flyway integration suite on a host with a working Docker daemon:

```bash
mvn --batch-mode --no-transfer-progress -pl apps/backend -Pmysql-it verify
```

The `mysql-it` profile adds `src/it/java` only for that command, starts an isolated MySQL 8.4 Testcontainers database, applies all Flyway migrations, and verifies MySQL-backed BFF session persistence plus reward idempotency. It does not connect to a developer or production database.

For a quick rerun of only the Failsafe suite after the regular H2 suite has already passed, add `-Dmysql.it.skip.unit.tests=true`.
