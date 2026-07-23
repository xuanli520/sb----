-- Test-only fixtures run after the production cleanup migration.
INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat, purchase_price)
VALUES (1, '星海拾光', '林墨', '科幻', 286000, '连载中', '在旧港口收到一封来自星海的来信。', '#1f6d7a', 'PUBLISHED', 2, 9820, 30);
INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat, purchase_price)
VALUES (2, '长安夜行录', '沈月', '悬疑', 421000, '已完结', '一盏灯，照出长安城里无人知晓的案卷。', '#9c4b39', 'PUBLISHED', 4, 7600, 1);
INSERT INTO novel_book(id, title, author_name, category, word_count, serial_status, synopsis, cover, status, author_id, heat, purchase_price)
VALUES (3, '山河有信', '顾南', '古言', 318000, '连载中', '乱世里，两个普通人写给彼此的信。', '#607446', 'PUBLISHED', 5, 6350, 1);
INSERT INTO novel_chapter(id, book_id, title, content, published, status, order_no, published_at) VALUES
 (1001, 1, '第一章 旧港', '雨落在旧港，信使留下了一枚发亮的徽章。 我知道，离开地球的日子终于到了。', TRUE, 'PUBLISHED', 1, CURRENT_TIMESTAMP),
 (1002, 2, '第一章 灯下人', '长安城的雨停了，石板路映着一盏孤灯。 案卷上的名字，已经被人划去。', TRUE, 'PUBLISHED', 1, CURRENT_TIMESTAMP),
 (1003, 3, '第一章 北风', '北风卷起城门上的旧旗，远方传来归人的消息。', TRUE, 'PUBLISHED', 1, CURRENT_TIMESTAMP);
INSERT INTO novel_redemption_code(code, batch_no, benefit_type, token_amount, book_id, membership_days, status, expires_at, redeemed_by_user_id, redeemed_at, created_at, updated_at)
VALUES ('WELCOME100', 'SYSTEM-DEMO', 'TOKEN', 100, NULL, 0, 'ACTIVE', NULL, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO novel_sensitive_word(normalized_word, word, enabled, created_at, updated_at) VALUES ('敏感词', '敏感词', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO novel_operating_taxonomy(taxonomy_type, normalized_name, name, enabled, sort_order, created_at, updated_at) VALUES
 ('CATEGORY', '科幻', '科幻', TRUE, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ('CATEGORY', '悬疑', '悬疑', TRUE, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ('CATEGORY', '古言', '古言', TRUE, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO novel_hot_search_term(normalized_term, term, enabled, display_rank, created_at, updated_at) VALUES
 ('星海', '星海', TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ('长安', '长安', TRUE, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP), ('旧港', '旧港', TRUE, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
UPDATE novel_book SET editorial_rank = 1 WHERE id = 1;
UPDATE novel_book SET editorial_rank = 2 WHERE id = 3;
UPDATE novel_book SET editorial_rank = 3 WHERE id = 2;
INSERT INTO novel_home_carousel_slide(id, book_id, headline, copy_text, enabled, display_rank, version, created_at, updated_at) VALUES
 (1, 1, NULL, NULL, TRUE, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 (2, 3, NULL, NULL, TRUE, 2, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
 (3, 2, NULL, NULL, TRUE, 3, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
