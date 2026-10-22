-- Remove the Indian pricing columns.
--
-- The site quotes euro only; priceInr and discountInr were dropped from
-- content/courses.json and from the templates. These columns are the last
-- trace of them, and leaving them invites someone to fill them in again.
--
-- Written so it can be run twice without failing: MySQL has no
-- DROP COLUMN IF EXISTS before 8.0.29, so each drop is guarded by a check
-- against information_schema.

SET @drop_price := (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `courses` DROP COLUMN `price_inr`',
    'SELECT "price_inr already gone" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'price_inr'
);
PREPARE s FROM @drop_price; EXECUTE s; DEALLOCATE PREPARE s;

SET @drop_disc := (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE `courses` DROP COLUMN `discount_inr`',
    'SELECT "discount_inr already gone" AS note')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'discount_inr'
);
PREPARE s FROM @drop_disc; EXECUTE s; DEALLOCATE PREPARE s;
