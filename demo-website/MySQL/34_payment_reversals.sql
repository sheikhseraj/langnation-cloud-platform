-- Reversing a payment.
--
-- A payment entered wrongly is not deleted and not edited. It is
-- reversed: a second row carrying the negative of the first, pointing
-- at it. The invoice's balance is then recomputed from the sum of its
-- payments and comes out where it should, and the account still reads
-- as what actually happened — somebody took 500, somebody noticed, it
-- was put back.
--
-- That is not bureaucracy for its own sake. An UPDATE on a payment row
-- leaves no trace that it ever said something different, and a DELETE
-- leaves no trace at all. Either is indistinguishable from a member of
-- staff quietly removing a payment that never arrived after pocketing
-- the cash, and neither the school nor the person accused of it can
-- prove otherwise afterwards. Append-only is what makes the question
-- answerable.
--
-- ── Why a column and not just a negative row ────────────────────────
--
-- The table already allows negative amounts, so a reversal could have
-- been written without this. But then it is a mystery: a minus 500
-- sitting under a 500 with nothing joining them, and no way to show on
-- a page that THIS payment was the one withdrawn, or to stop the same
-- one being reversed twice. `reverses_id` makes the pair a fact in the
-- database rather than something a reader has to infer.
--
-- RESTRICT on delete, not CASCADE: the point of the link is that the
-- thing it points at cannot quietly go away.

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'payments'
                AND column_name = 'reverses_id');
SET @sql := IF(@col = 0,
  'ALTER TABLE `payments` ADD COLUMN `reverses_id` INT UNSIGNED DEFAULT NULL AFTER `invoice_id`',
  'SELECT "payments.reverses_id is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- UNIQUE, so one payment cannot be reversed twice. Two reversals of
-- one 500 would take 1000 off the account, which is the same hole the
-- whole arrangement exists to close — and it is exactly the mistake a
-- double-clicked button makes.
SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = 'payments'
                AND index_name = 'uniq_reverses');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `payments` ADD UNIQUE KEY `uniq_reverses` (`reverses_id`)',
  'SELECT "uniq_reverses is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM information_schema.table_constraints
             WHERE table_schema = DATABASE() AND table_name = 'payments'
               AND constraint_name = 'fk_pay_reverses');
SET @sql := IF(@fk = 0,
  'ALTER TABLE `payments` ADD CONSTRAINT `fk_pay_reverses` FOREIGN KEY (`reverses_id`) REFERENCES `payments` (`id`) ON DELETE RESTRICT',
  'SELECT "fk_pay_reverses is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'payments can be reversed' AS note;
