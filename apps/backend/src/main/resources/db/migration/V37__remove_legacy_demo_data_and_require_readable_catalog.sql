-- Historical migrations remain immutable for deployed databases. This migration removes their
-- demo projection from both upgraded and newly created production schemas.
DELETE FROM novel_author_comment_moderation_advice WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_author_annotation_moderation_advice WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_paragraph_annotation WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_comment WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_chapter_candidate WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_reader_progress WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_reader_bookmark WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_reader_activity_event WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_reader_favorite_event WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_subscription_event WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_subscription WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_reader_bookshelf WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_entitlement WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_reward_record WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_author_subscription_ledger WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_rating WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_vote WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_interaction_stat WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_status_audit WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_legacy_review_triage_audit WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_moderation_snapshot_chunk WHERE snapshot_id IN (SELECT id FROM novel_book_moderation_snapshot WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信')));
DELETE FROM novel_book_moderation_snapshot WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_media_asset_binding WHERE binding_type = 'BOOK_COVER' AND target_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book_cover_candidate WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_home_carousel_slide WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_chapter WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_volume WHERE book_id IN (SELECT id FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信'));
DELETE FROM novel_book WHERE id IN (1, 2, 3) AND title IN ('星海拾光', '长安夜行录', '山河有信');

DELETE FROM novel_redemption_code WHERE code = 'WELCOME100' AND batch_no = 'SYSTEM-DEMO';
DELETE FROM novel_sensitive_word WHERE normalized_word = '敏感词' AND word = '敏感词';
DELETE FROM novel_hot_search_term
WHERE created_by_user_id IS NULL AND updated_by_user_id IS NULL AND normalized_term IN ('星海', '长安', '旧港');
DELETE FROM novel_operating_taxonomy
WHERE created_by_user_id IS NULL AND updated_by_user_id IS NULL
  AND taxonomy_type = 'CATEGORY' AND normalized_name IN ('科幻', '悬疑', '古言');

-- A public row without a public chapter is a broken reader route. Keep the author work and send
-- it through the existing review workflow instead of exposing unreviewed text.
UPDATE novel_book b SET status = 'PENDING_REVIEW', updated_at = CURRENT_TIMESTAMP
WHERE b.status = 'PUBLISHED'
  AND NOT EXISTS (
      SELECT 1 FROM novel_chapter c
      WHERE c.book_id = b.id AND c.published = TRUE AND c.status = 'PUBLISHED'
  );
