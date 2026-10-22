-- Instalments.
--
-- A payment plan is not a new kind of record. It is a course fee split
-- across several invoices with different due dates, which is what a
-- German school issues anyway: the student is owed a Rechnung for each
-- amount they are asked to pay, and the plan is simply the set of them.
--
-- ── Why this is not three new tables ────────────────────────────────
--
-- `invoices` and `payments` already exist and are already the right
-- shape. Invoices carry DECIMAL money, a currency, a due date, a
-- running paid_amount, a status, the enrolment, who created it, and
-- the §14 UStG fields a German invoice is required to print. Payments
-- are append-only, carry a method whose enum already lists card and
-- SEPA for later, and have a UNIQUE reference so the same transfer
-- cannot be banked twice.
--
-- A separate payment_plans/instalments pair would be a second ledger
-- beside that one, and two tables that each believe they know what a
-- student owes will eventually disagree. The one people read is then
-- whichever the page happens to query.
--
-- So an instalment IS an invoice, and all this migration adds is its
-- place in the sequence.
--
-- ── What that buys, beyond one ledger ───────────────────────────────
--
-- The rules that already guard invoices now guard instalments for
-- free. `locked_at` means an issued amount cannot be quietly edited;
-- a correction is a Storno and a reissue, which is both what the law
-- wants and what anybody auditing the account needs to see. The
-- numbering is gapless because `invoice_counters` hands out numbers
-- inside the writing transaction. None of that would have come with a
-- plain instalments table, and all of it would have had to be built
-- again the first time the school was asked for a proper invoice.
--
-- ── The two columns ─────────────────────────────────────────────────
--
-- Nullable, because most invoices are not instalments: an exam fee is
-- one invoice and nothing else. `instalment_of` is stored rather than
-- counted so "2 of 3" still reads correctly after one of the three has
-- been cancelled by a Storno — the student was promised three.

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'invoices'
                AND column_name = 'instalment_no');
SET @sql := IF(@col = 0,
  'ALTER TABLE `invoices` ADD COLUMN `instalment_no` SMALLINT UNSIGNED DEFAULT NULL AFTER `enrolment_id`',
  'SELECT "invoices.instalment_no is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'invoices'
                AND column_name = 'instalment_of');
SET @sql := IF(@col = 0,
  'ALTER TABLE `invoices` ADD COLUMN `instalment_of` SMALLINT UNSIGNED DEFAULT NULL AFTER `instalment_no`',
  'SELECT "invoices.instalment_of is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- The plan for one enrolment is read in due-date order on every view of
-- the student's Payments page and on every row of the admin overview.
-- Without this it is a filesort over every invoice the school has ever
-- raised.
SET @idx := (SELECT COUNT(*) FROM information_schema.statistics
              WHERE table_schema = DATABASE() AND table_name = 'invoices'
                AND index_name = 'idx_enrolment_due');
SET @sql := IF(@idx = 0,
  'ALTER TABLE `invoices` ADD KEY `idx_enrolment_due` (`enrolment_id`, `due_on`)',
  'SELECT "idx_enrolment_due is already there" AS note');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT 'invoices can be instalments' AS note;
