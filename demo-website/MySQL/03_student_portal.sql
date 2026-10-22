-- ═══════════════════════════════════════════════════════════════════════
--  LangNation — student portal
--
--  Run AFTER 01_create_tables.sql and 02_content_tables.sql: this file
--  references `courses` and `admin_users` from 02.
--
--  Covers the four things a signed-in student can do:
--    1. see placement results and download a certificate
--    2. see their course schedule and its materials
--    3. see invoices, issued once staff confirm the money arrived
--    4. submit homework and read the teacher's feedback
--
--  Accounts are self-service. Anyone can register — people need an
--  account to sign up for an event as well as for a course — and staff can
--  also create one directly when they enrol somebody.
--
--  Registering gets you an account, not access. A new account is `pending`
--  until the email is verified, and even once active it shows only what the
--  student is actually attached to: an event registration, or an enrolment
--  that staff created. So a stranger signing up sees their own empty portal
--  and nothing else.
--
--  Because the sign-up form is public it is an abuse target. Three things
--  guard it, and none of them belong in the schema, so they are noted here
--  as required of the route: a honeypot field (the enquiry form already
--  uses one), per-IP rate limiting, and no confirmation that an email is
--  already registered — otherwise the form becomes a way to test whether
--  somebody studies here.
--
--  ── Personal data ──────────────────────────────────────────────────
--  Every table here holds personal data under GDPR, and the school is in
--  Germany. Two consequences are built in rather than bolted on:
--    · `students.deleted_at` supports erasure requests without breaking
--      the invoices and certificates that must legally be retained.
--    · `audit_log` records who changed money and grades, because those
--      are the two things people dispute.
-- ═══════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ── Teachers ─────────────────────────────────────────────────────────
--  Teachers are staff, so they live in `admin_users` rather than in a
--  parallel table with its own login. This widens the existing role enum;
--  it is safe to re-run because MODIFY restates the whole column.
ALTER TABLE `admin_users`
  MODIFY `role` ENUM('owner','editor','teacher') NOT NULL DEFAULT 'editor';


-- ── Students ─────────────────────────────────────────────────────────
--  Two ways in, one table:
--    self-registered  password set at sign-up, `status` = pending until the
--                     verification email is followed, then active
--    staff-created    `password_hash` NULL and `status` = invited until the
--                     student follows the invite link and chooses one
--
--  `origin` records which, because it changes how much the row can be
--  trusted: a staff-created account was typed in by someone who had the
--  student in front of them, a self-registered one was not.
--
--  `token_version` exists so a session can be revoked. Sessions are signed
--  cookies rather than rows (the same approach as /admin), which normally
--  means they cannot be cancelled before they expire. The version is
--  embedded in the cookie and compared on every request, so bumping it
--  signs that student out of every device immediately — needed the moment
--  staff suspend an account or a laptop is lost.
CREATE TABLE IF NOT EXISTS `students` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Shown to the student and printed on certificates. Not a login field.
  -- NULL until the account is verified, so abandoned sign-ups do not
  -- consume reference numbers and leave visible gaps in the sequence.
  `student_ref`          VARCHAR(20)  DEFAULT NULL,
  `name`                 VARCHAR(120) NOT NULL,
  `email`                VARCHAR(180) NOT NULL,
  `phone`                VARCHAR(40)  DEFAULT NULL,
  `country`              VARCHAR(80)  DEFAULT NULL,
  `address`              VARCHAR(400) DEFAULT NULL,
  `date_of_birth`        DATE         DEFAULT NULL,
  -- bcrypt. NULL only on a staff-created account that has not yet been
  -- claimed; a self-registered one sets it at sign-up.
  `password_hash`        VARCHAR(100) DEFAULT NULL,
  -- Only the hash of the token is stored, so a database leak cannot be
  -- used to claim an account. One pair of columns serves both the staff
  -- invite link and the self-sign-up verification link: they are the same
  -- mechanism — a one-time URL that proves control of the mailbox — and a
  -- row is only ever waiting on one of them.
  `invite_token_hash`    CHAR(64)     DEFAULT NULL,
  `invite_expires_at`    DATETIME     DEFAULT NULL,
  `reset_token_hash`     CHAR(64)     DEFAULT NULL,
  `reset_expires_at`     DATETIME     DEFAULT NULL,
  `token_version`        INT UNSIGNED NOT NULL DEFAULT 1,
  `status`               ENUM('pending','invited','active','suspended') NOT NULL DEFAULT 'pending',
  `origin`               ENUM('self','staff') NOT NULL DEFAULT 'self',
  `email_verified_at`    DATETIME     DEFAULT NULL,
  `preferred_lang`       CHAR(2)      NOT NULL DEFAULT 'en',
  `last_login_at`        DATETIME     DEFAULT NULL,
  -- Failed-login throttling, so the portal cannot be brute-forced.
  `failed_logins`        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until`         DATETIME     DEFAULT NULL,
  `notes`                TEXT         DEFAULT NULL,
  `created_by`           INT UNSIGNED DEFAULT NULL,
  `created_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Erasure requests: the row is anonymised and dated rather than deleted,
  -- so retained invoices and issued certificates keep a valid parent.
  `deleted_at`           DATETIME     DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_email` (`email`),
  UNIQUE KEY `uniq_student_ref` (`student_ref`),
  KEY `idx_status` (`status`),
  KEY `idx_origin_created` (`origin`, `created_at`),
  KEY `idx_invite` (`invite_token_hash`),
  KEY `idx_reset` (`reset_token_hash`),
  CONSTRAINT `fk_students_creator` FOREIGN KEY (`created_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Intakes ──────────────────────────────────────────────────────────
--  A course is the thing you advertise; an intake is one actual run of it,
--  with a start date, a teacher and a timetable. Students enrol on an
--  intake, not on a course — otherwise last year's students and this
--  term's cannot be told apart.
CREATE TABLE IF NOT EXISTS `intakes` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id`      INT UNSIGNED NOT NULL,
  -- e.g. "B2-2026-04". Appears in invoices and on certificates.
  `code`           VARCHAR(40)  NOT NULL,
  `title`          VARCHAR(200) DEFAULT NULL,
  `teacher_id`     INT UNSIGNED DEFAULT NULL,
  `starts_on`      DATE         DEFAULT NULL,
  `ends_on`        DATE         DEFAULT NULL,
  -- IANA name, e.g. Europe/Berlin. Classes are online across time zones,
  -- so a bare local time is ambiguous and gets people to class an hour late.
  `timezone`       VARCHAR(64)  NOT NULL DEFAULT 'Europe/Berlin',
  `seats`          SMALLINT UNSIGNED DEFAULT NULL,
  `meeting_url`    VARCHAR(500) DEFAULT NULL,
  `status`         ENUM('planned','running','finished','cancelled') NOT NULL DEFAULT 'planned',
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_code` (`code`),
  KEY `idx_course` (`course_id`),
  KEY `idx_teacher` (`teacher_id`),
  KEY `idx_status_start` (`status`, `starts_on`),
  CONSTRAINT `fk_intakes_course` FOREIGN KEY (`course_id`)
    REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_intakes_teacher` FOREIGN KEY (`teacher_id`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Enrolments ───────────────────────────────────────────────────────
--  The join that decides what a student can see. Every materials, lesson,
--  assignment and invoice query filters through this table, so a student
--  can never reach another cohort's files.
CREATE TABLE IF NOT EXISTS `enrolments` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`    INT UNSIGNED NOT NULL,
  `intake_id`     INT UNSIGNED NOT NULL,
  `status`        ENUM('active','completed','withdrawn','failed') NOT NULL DEFAULT 'active',
  `enrolled_on`   DATE         NOT NULL DEFAULT (CURRENT_DATE),
  `completed_on`  DATE         DEFAULT NULL,
  -- Final mark, if the school records one. Nullable: not every course has
  -- an exam, and a certificate can be issued without a percentage.
  `final_grade`   DECIMAL(5,2) DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- A student cannot be enrolled twice on the same run.
  UNIQUE KEY `uniq_student_intake` (`student_id`, `intake_id`),
  KEY `idx_intake_status` (`intake_id`, `status`),
  CONSTRAINT `fk_enrol_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrol_intake` FOREIGN KEY (`intake_id`)
    REFERENCES `intakes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Lessons (the timetable) ──────────────────────────────────────────
--  `starts_at` is UTC. The intake's timezone is what it is displayed in.
--  Storing local time instead breaks twice a year at the DST boundary.
CREATE TABLE IF NOT EXISTS `lessons` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `intake_id`    INT UNSIGNED NOT NULL,
  `seq`          SMALLINT UNSIGNED DEFAULT NULL,
  `title`        VARCHAR(200) NOT NULL,
  `starts_at`    DATETIME     NOT NULL,
  `minutes`      SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  -- Overrides the intake's standing room link when a class moves.
  `meeting_url`  VARCHAR(500) DEFAULT NULL,
  `notes`        TEXT         DEFAULT NULL,
  `status`       ENUM('scheduled','held','cancelled') NOT NULL DEFAULT 'scheduled',
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_intake_start` (`intake_id`, `starts_at`),
  CONSTRAINT `fk_lessons_intake` FOREIGN KEY (`intake_id`)
    REFERENCES `intakes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Materials ────────────────────────────────────────────────────────
--  Attached to an intake, or to a CEFR level for anything shared across
--  every run of it. `stored_name` is a generated name on disk, never the
--  uploaded filename: the old site served user-supplied names straight
--  back and had files whose names alone broke links.
--
--  Files live outside public/ and are streamed by a route that checks the
--  enrolment first. A file under public/ is world-readable whatever the
--  page around it says.
CREATE TABLE IF NOT EXISTS `materials` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `intake_id`     INT UNSIGNED DEFAULT NULL,
  `level`         VARCHAR(4)   DEFAULT NULL,
  `title`         VARCHAR(200) NOT NULL,
  `description`   VARCHAR(400) DEFAULT NULL,
  `stored_name`   VARCHAR(160) NOT NULL,
  `original_name` VARCHAR(255) DEFAULT NULL,
  `mime`          VARCHAR(100) DEFAULT NULL,
  `bytes`         INT UNSIGNED DEFAULT NULL,
  `kind`          ENUM('worksheet','audio','video','reading','exam','other') NOT NULL DEFAULT 'other',
  `sort_order`    SMALLINT     NOT NULL DEFAULT 0,
  `visible`       TINYINT(1)   NOT NULL DEFAULT 1,
  `uploaded_by`   INT UNSIGNED DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_stored` (`stored_name`),
  KEY `idx_intake` (`intake_id`, `sort_order`),
  KEY `idx_level` (`level`),
  CONSTRAINT `fk_materials_intake` FOREIGN KEY (`intake_id`)
    REFERENCES `intakes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_materials_uploader` FOREIGN KEY (`uploaded_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Placement results ────────────────────────────────────────────────
--  The automated test already grades itself and hands back a signed
--  result; this is where it lands so the student can see it again later.
--
--  `student_id` is nullable on purpose: most people take the test before
--  they are anybody's student. The row is claimed by matching the email
--  when an account is created for them.
CREATE TABLE IF NOT EXISTS `placement_results` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`     INT UNSIGNED DEFAULT NULL,
  `name`           VARCHAR(120) NOT NULL,
  `email`          VARCHAR(180) NOT NULL,
  `phone`          VARCHAR(40)  DEFAULT NULL,
  `country`        VARCHAR(80)  DEFAULT NULL,
  `track`          VARCHAR(10)  NOT NULL,
  `placed_level`   VARCHAR(4)   NOT NULL,
  `score_percent`  DECIMAL(5,2) DEFAULT NULL,
  -- Per-level breakdown as JSON, so the transcript can be redrawn without
  -- keeping a row per question.
  `breakdown`      JSON         DEFAULT NULL,
  `questions`      SMALLINT UNSIGNED DEFAULT NULL,
  `correct`        SMALLINT UNSIGNED DEFAULT NULL,
  `lang`           CHAR(2)      NOT NULL DEFAULT 'en',
  `ip`             VARCHAR(45)  DEFAULT NULL,
  `taken_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_email` (`email`),
  KEY `idx_taken` (`taken_at`),
  CONSTRAINT `fk_placement_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Certificates ─────────────────────────────────────────────────────
--  Both the 198 migrated from the old site and everything issued from now
--  on. `legacy_id` keeps the number that is printed on paper already in
--  students' hands.
--
--  The old data has 30 certificate numbers used by more than one student,
--  so the legacy column is deliberately NOT unique — the duplicates have
--  to be importable before they can be reviewed and corrected. New
--  certificates get `code`, which is unique and is what /verify checks.
CREATE TABLE IF NOT EXISTS `certificates` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Unique, unguessable, and safe to print in a QR code.
  `code`           VARCHAR(32)  NOT NULL,
  `legacy_id`      VARCHAR(40)  DEFAULT NULL,
  `student_id`     INT UNSIGNED DEFAULT NULL,
  `enrolment_id`   INT UNSIGNED DEFAULT NULL,
  -- Denormalised so a certificate still prints correctly after a course is
  -- renamed or a student exercises erasure. A certificate is a historical
  -- record: it must not change because a row elsewhere changed.
  `student_name`   VARCHAR(120) NOT NULL,
  `course_title`   VARCHAR(200) NOT NULL,
  `level`          VARCHAR(4)   DEFAULT NULL,
  `grade`          VARCHAR(40)  DEFAULT NULL,
  `hours`          SMALLINT UNSIGNED DEFAULT NULL,
  `issued_on`      DATE         NOT NULL,
  `issued_by`      INT UNSIGNED DEFAULT NULL,
  `revoked_at`     DATETIME     DEFAULT NULL,
  `revoked_reason` VARCHAR(255) DEFAULT NULL,
  -- Set once the PDF has been rendered and stored.
  `pdf_name`       VARCHAR(160) DEFAULT NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_code` (`code`),
  KEY `idx_legacy` (`legacy_id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_issued` (`issued_on`),
  CONSTRAINT `fk_cert_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cert_enrolment` FOREIGN KEY (`enrolment_id`)
    REFERENCES `enrolments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cert_issuer` FOREIGN KEY (`issued_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Invoices ─────────────────────────────────────────────────────────
--  Money, so: amounts are DECIMAL and never FLOAT, and totals are stored
--  rather than recomputed at read time, because an invoice must show what
--  was actually charged even after a price changes.
--
--  ── Written for German invoicing ───────────────────────────────────
--  An invoice here is raised AFTER the money arrives: staff find the
--  student or the batch, confirm the payment, and the invoice is generated
--  and emailed in the same transaction. So a row is normally born already
--  paid. The draft/issued states remain for the case where the school
--  wants to bill in advance.
--
--  Section 14 UStG requires an invoice to carry, at minimum: both parties'
--  full name and address, the supplier's tax number or VAT ID, the invoice
--  date, the date or period of supply, the quantity and nature of the
--  service, the net amount, the tax rate and tax amount — or, where the
--  supply is exempt, a statement of why. Everything on that list is a
--  column below.
--
--  Both parties' details are SNAPSHOT onto the invoice rather than joined
--  at print time. An invoice is a historical document: it has to keep
--  showing the address the student had and the tax number the school had
--  on the day it was issued, not today's.
--
--  Numbering must be sequential with no gaps, so it is assigned from
--  `invoice_counters` inside the same transaction, never from COUNT(*) or
--  from the auto-increment id.
--
--  Under GoBD an issued invoice must not be altered. `locked_at` marks
--  that point; a mistake is corrected by issuing a Storno that cancels it
--  and then a fresh invoice, which is what `kind` and `cancels_invoice_id`
--  are for. Editing a locked row is a bug, not a feature.
CREATE TABLE IF NOT EXISTS `invoices` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `number`        VARCHAR(40)  DEFAULT NULL,
  -- A Storno is a cancellation invoice: it carries the negative of the one
  -- it cancels and gets its own number from the same sequence.
  `kind`          ENUM('invoice','storno') NOT NULL DEFAULT 'invoice',
  `cancels_invoice_id` INT UNSIGNED DEFAULT NULL,
  `student_id`    INT UNSIGNED NOT NULL,
  `enrolment_id`  INT UNSIGNED DEFAULT NULL,
  -- EUR at launch. The column stays because the courses table also carries
  -- INR prices for the Indian market.
  `currency`      CHAR(3)      NOT NULL DEFAULT 'EUR',
  -- Who supplied, as it stood on the issue date (section 14 UStG).
  `seller_name`    VARCHAR(200) DEFAULT NULL,
  `seller_address` VARCHAR(400) DEFAULT NULL,
  `seller_tax_id`  VARCHAR(60)  DEFAULT NULL,
  -- Who was billed, likewise frozen. Not read from `students` at print
  -- time: people move, and a reissued invoice must not silently change.
  `billing_name`   VARCHAR(200) DEFAULT NULL,
  `billing_address` VARCHAR(400) DEFAULT NULL,
  -- The period the teaching covers — Leistungszeitraum. Required, and for
  -- a course it is a range rather than a single date.
  `service_from`   DATE        DEFAULT NULL,
  `service_to`     DATE        DEFAULT NULL,
  -- Printed verbatim under the totals. Where language teaching is exempt
  -- the reason must be stated, and a small business under section 19 must
  -- say so instead of showing a tax rate. Left to configuration rather
  -- than hard-coded, because which applies is the school's tax adviser's
  -- call and not something to guess in a schema.
  `tax_note`       VARCHAR(300) DEFAULT NULL,
  -- The language the PDF was rendered in, so a reissue matches the original.
  `lang`           CHAR(2)     NOT NULL DEFAULT 'de',
  `subtotal`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `tax_percent`   DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `tax_amount`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total`         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  -- Kept as a column so "what is outstanding" is one indexed read rather
  -- than a SUM over payments on every page view.
  `paid_amount`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`        ENUM('draft','issued','part_paid','paid','void') NOT NULL DEFAULT 'draft',
  `issued_on`     DATE         DEFAULT NULL,
  `due_on`        DATE         DEFAULT NULL,
  `paid_on`       DATE         DEFAULT NULL,
  `notes`         VARCHAR(500) DEFAULT NULL,
  `pdf_name`      VARCHAR(160) DEFAULT NULL,
  -- Set when the invoice is issued. After this it is read-only.
  `locked_at`     DATETIME     DEFAULT NULL,
  `created_by`    INT UNSIGNED DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_number` (`number`),
  KEY `idx_student_status` (`student_id`, `status`),
  KEY `idx_due` (`due_on`),
  KEY `idx_kind` (`kind`),
  CONSTRAINT `fk_inv_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_inv_enrolment` FOREIGN KEY (`enrolment_id`)
    REFERENCES `enrolments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inv_creator` FOREIGN KEY (`created_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_inv_cancels` FOREIGN KEY (`cancels_invoice_id`)
    REFERENCES `invoices` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Invoice numbering ────────────────────────────────────────────────
--  One row per series per year, holding the last number handed out.
--  Claiming the next number is UPDATE ... SET last_number = last_number + 1
--  inside the same transaction that writes the invoice, so two staff
--  confirming payments at once cannot be given the same number and a
--  rolled-back transaction cannot leave a gap.
--
--  Deriving the number from COUNT(*) or from the auto-increment id looks
--  equivalent and is not: deletes, gaps and concurrency all break it, and
--  gapless sequence is exactly what a tax audit checks.
CREATE TABLE IF NOT EXISTS `invoice_counters` (
  -- e.g. 'invoice' and 'storno', should the school want separate series.
  `series`      VARCHAR(20)  NOT NULL,
  `year`        SMALLINT UNSIGNED NOT NULL,
  `last_number` INT UNSIGNED NOT NULL DEFAULT 0,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`series`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id`  INT UNSIGNED NOT NULL,
  `description` VARCHAR(300) NOT NULL,
  `quantity`    DECIMAL(8,2)  NOT NULL DEFAULT 1.00,
  `unit_price`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `amount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `sort_order`  SMALLINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_invoice` (`invoice_id`, `sort_order`),
  CONSTRAINT `fk_item_invoice` FOREIGN KEY (`invoice_id`)
    REFERENCES `invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payments are append-only. A correction is a negative row, never an edit,
-- so the history of what was taken and refunded stays readable.
CREATE TABLE IF NOT EXISTS `payments` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id`    INT UNSIGNED NOT NULL,
  `amount`        DECIMAL(10,2) NOT NULL,
  `currency`      CHAR(3)      NOT NULL DEFAULT 'EUR',
  -- Launch is Germany, and only two of these are in use: a SEPA transfer
  -- (Uberweisung) or cash at the school. The rest are listed now so that
  -- adding them later is a code change and not a migration on a table that
  -- by then holds real accounting records.
  `method`        ENUM('bank_transfer','cash','sepa_direct_debit','card','other')
                    NOT NULL DEFAULT 'bank_transfer',
  -- The bank's end-to-end reference for a transfer, a receipt number for
  -- cash, or a gateway transaction id if online payment is ever added.
  -- Unique so the same reference cannot be banked twice — which is both
  -- how a webhook double-credits an account and how a tired member of
  -- staff records the same transfer on two different days.
  `reference`     VARCHAR(160) DEFAULT NULL,
  `received_on`   DATE         NOT NULL,
  `recorded_by`   INT UNSIGNED DEFAULT NULL,
  `note`          VARCHAR(300) DEFAULT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_reference` (`reference`),
  KEY `idx_invoice` (`invoice_id`),
  CONSTRAINT `fk_pay_invoice` FOREIGN KEY (`invoice_id`)
    REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pay_recorder` FOREIGN KEY (`recorded_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Homework ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `assignments` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `intake_id`    INT UNSIGNED NOT NULL,
  `lesson_id`    INT UNSIGNED DEFAULT NULL,
  `title`        VARCHAR(200) NOT NULL,
  `brief`        MEDIUMTEXT   DEFAULT NULL,
  `due_at`       DATETIME     DEFAULT NULL,
  `max_points`   SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  `allow_late`   TINYINT(1)   NOT NULL DEFAULT 1,
  `published`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_by`   INT UNSIGNED DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_intake_due` (`intake_id`, `due_at`),
  CONSTRAINT `fk_asg_intake` FOREIGN KEY (`intake_id`)
    REFERENCES `intakes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_asg_lesson` FOREIGN KEY (`lesson_id`)
    REFERENCES `lessons` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_asg_creator` FOREIGN KEY (`created_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--  One row per student per assignment; resubmission bumps `attempt` and
--  overwrites, so a student cannot flood the table.
CREATE TABLE IF NOT EXISTS `submissions` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assignment_id`  INT UNSIGNED NOT NULL,
  `student_id`     INT UNSIGNED NOT NULL,
  `attempt`        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `text_answer`    MEDIUMTEXT   DEFAULT NULL,
  `submitted_at`   DATETIME     DEFAULT NULL,
  `status`         ENUM('draft','submitted','marked','returned') NOT NULL DEFAULT 'draft',
  `points`         DECIMAL(5,2) DEFAULT NULL,
  `feedback`       MEDIUMTEXT   DEFAULT NULL,
  `marked_by`      INT UNSIGNED DEFAULT NULL,
  `marked_at`      DATETIME     DEFAULT NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_assignment_student` (`assignment_id`, `student_id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_sub_assignment` FOREIGN KEY (`assignment_id`)
    REFERENCES `assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_marker` FOREIGN KEY (`marked_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--  Attachments. Stored outside public/ and streamed after an ownership
--  check, for the same reason as materials: anything under public/ is
--  readable by anyone who guesses the URL.
CREATE TABLE IF NOT EXISTS `submission_files` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `submission_id`  INT UNSIGNED NOT NULL,
  `stored_name`    VARCHAR(160) NOT NULL,
  `original_name`  VARCHAR(255) DEFAULT NULL,
  `mime`           VARCHAR(100) DEFAULT NULL,
  `bytes`          INT UNSIGNED DEFAULT NULL,
  `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_stored` (`stored_name`),
  KEY `idx_submission` (`submission_id`),
  CONSTRAINT `fk_subfile_submission` FOREIGN KEY (`submission_id`)
    REFERENCES `submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Event registrations ──────────────────────────────────────────────
--  The reason sign-up is public: someone who is not a student wants a place
--  at an event.
--
--  `event_slug` is a plain string matching content/events.json rather than
--  a foreign key, because events are still file-based content. When they
--  move into the CMS this gains an FK; until then a string is honest about
--  what it is, and the title is copied in so a past registration still
--  reads correctly after the event file changes.
CREATE TABLE IF NOT EXISTS `event_registrations` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`   INT UNSIGNED NOT NULL,
  `event_slug`   VARCHAR(160) NOT NULL,
  `event_title`  VARCHAR(200) DEFAULT NULL,
  `event_date`   DATE         DEFAULT NULL,
  `seats`        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `status`       ENUM('registered','waitlisted','attended','cancelled','no_show')
                   NOT NULL DEFAULT 'registered',
  `note`         VARCHAR(300) DEFAULT NULL,
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One place per person per event; changing your mind updates the status
  -- rather than adding a second row.
  UNIQUE KEY `uniq_student_event` (`student_id`, `event_slug`),
  KEY `idx_event_status` (`event_slug`, `status`),
  CONSTRAINT `fk_evreg_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── Audit log ────────────────────────────────────────────────────────
--  Money and grades get disputed, and "the system says so" is not an
--  answer. One row per consequential change, written by the application.
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_type`  ENUM('staff','student','system') NOT NULL DEFAULT 'staff',
  `actor_id`    INT UNSIGNED DEFAULT NULL,
  `action`      VARCHAR(60)  NOT NULL,
  `entity`      VARCHAR(40)  NOT NULL,
  `entity_id`   INT UNSIGNED DEFAULT NULL,
  `detail`      JSON         DEFAULT NULL,
  `ip`          VARCHAR(45)  DEFAULT NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_entity` (`entity`, `entity_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
