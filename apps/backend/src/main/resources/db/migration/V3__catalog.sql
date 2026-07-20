CREATE TABLE novel_catalog_sequence (
    sequence_name VARCHAR(64) NOT NULL PRIMARY KEY,
    next_value BIGINT NOT NULL
);

CREATE TABLE novel_book (
    id BIGINT NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    category VARCHAR(128) NOT NULL,
    word_count INT NOT NULL DEFAULT 0,
    serial_status VARCHAR(32) NOT NULL,
    synopsis TEXT NOT NULL,
    cover VARCHAR(1024) NOT NULL,
    status VARCHAR(32) NOT NULL,
    author_id BIGINT NOT NULL,
    heat BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_novel_book_public ON novel_book(status, category, serial_status, heat);
CREATE INDEX idx_novel_book_author ON novel_book(author_id, id);

CREATE TABLE novel_chapter (
    id BIGINT NOT NULL PRIMARY KEY,
    book_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    order_no INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_novel_chapter_book FOREIGN KEY (book_id) REFERENCES novel_book(id),
    CONSTRAINT uk_novel_chapter_book_order UNIQUE (book_id, order_no)
);

CREATE INDEX idx_novel_chapter_book_published ON novel_chapter(book_id, published, order_no);

INSERT INTO novel_catalog_sequence(sequence_name, next_value) VALUES ('book', 101);
INSERT INTO novel_catalog_sequence(sequence_name, next_value) VALUES ('chapter', 1004);

INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat)
VALUES (1, '星海拾光', '林墨', '科幻', 286000, '连载中', '在旧港口收到一封来自星海的来信。', '#1f6d7a', 'PUBLISHED', 2, 9820);
INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat)
VALUES (2, '长安夜行录', '沈月', '悬疑', 421000, '已完结', '一盏灯，照出长安城里无人知晓的案卷。', '#9c4b39', 'PUBLISHED', 4, 7600);
INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat)
VALUES (3, '山河有信', '顾南', '古言', 318000, '连载中', '乱世里，两个普通人写给彼此的信。', '#607446', 'PUBLISHED', 5, 6350);

INSERT INTO novel_chapter(id, book_id, title, content, published, order_no)
VALUES (1001, 1, '第一章 旧港', '雨落在旧港，信使留下了一枚发亮的徽章。 我知道，离开地球的日子终于到了。', TRUE, 1);
INSERT INTO novel_chapter(id, book_id, title, content, published, order_no)
VALUES (1002, 2, '第一章 灯下人', '长安城的雨停了，石板路映着一盏孤灯。 案卷上的名字，已经被人划去。', TRUE, 1);
INSERT INTO novel_chapter(id, book_id, title, content, published, order_no)
VALUES (1003, 3, '第一章 北风', '北风卷起城门上的旧旗，远方传来归人的消息。', TRUE, 1);
