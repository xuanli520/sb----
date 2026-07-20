CREATE TABLE novel_account (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    login_name VARCHAR(128) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    roles VARCHAR(255) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_novel_account_login_name UNIQUE (login_name)
);

CREATE TABLE novel_login_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_login_session_account FOREIGN KEY (account_id) REFERENCES novel_account(id)
);

CREATE INDEX idx_novel_login_session_account ON novel_login_session(account_id);
CREATE INDEX idx_novel_login_session_expires_at ON novel_login_session(expires_at);

CREATE TABLE novel_bff_session (
    session_hash CHAR(64) PRIMARY KEY,
    login_session_id BIGINT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_bff_session_login_session FOREIGN KEY (login_session_id) REFERENCES novel_login_session(id)
);

CREATE INDEX idx_novel_bff_session_login_session ON novel_bff_session(login_session_id);
CREATE INDEX idx_novel_bff_session_expires_at ON novel_bff_session(expires_at);
