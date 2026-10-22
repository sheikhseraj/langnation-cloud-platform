-- Which migrations have been applied to this database?
--
-- Read-only. Changes nothing, safe to run at any time, safe to run
-- twice.
--
-- HOW TO RUN IT, in this order:
--   1. click YOUR DATABASE in the left-hand list of phpMyAdmin
--      (the one containing enquiries, courses, students)
--   2. click the SQL tab — NOT the Import tab
--   3. paste this whole file and press Go
--
-- Not Import. Import runs the statements and throws the results away,
-- so a successful import shows "finished" and none of the answers.
-- The entire output of this file IS a result set.
--
-- And the database has to be selected, because three of the checks
-- read real tables rather than the schema: migrations 11, 13 and 14
-- change DATA, and no amount of looking at information_schema can tell
-- you whether a course is called "Fast Track". Run those from the
-- server page, or with information_schema selected, and MySQL looks
-- for `courses` inside information_schema and answers
--     #1109 - Unknown table 'courses' in information_schema
-- which says nothing about migrations at all.
--
-- Those three are therefore LAST, in a statement of their own. If they
-- fail, the twenty-two schema checks above them have already printed,
-- so a wrong database costs you three answers instead of all of them.
-- The first statement says which database it is actually pointed at.
--
-- No number in the filename because this is not itself a migration and
-- must not be run as part of the sequence.
--
-- Each row asks the database for the one thing that migration adds —
-- a column, or a value only it writes — rather than trusting a list of
-- what somebody remembers running. If a row says "no", run that file.
-- Every migration is safe to re-run, so when in doubt, run it.

SELECT
  DATABASE() AS `running against`,
  IF(DATABASE() IS NULL OR DATABASE() = 'information_schema',
     'WRONG — pick your own database in the left-hand list, then run this again',
     'looks right') AS `is that your database?`;

SELECT '01_create_tables' AS migration,
       'enquiries, page_views' AS adds,
       IF(COUNT(*) = 2, 'yes', 'NO') AS applied
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('enquiries', 'page_views')

UNION ALL
SELECT '02_content_tables', 'courses, pages, media …',
       IF(COUNT(*) = 3, 'yes', 'NO')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('courses', 'pages', 'media')

UNION ALL
SELECT '03_student_portal', 'students, intakes, invoices …',
       IF(COUNT(*) = 3, 'yes', 'NO')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('students', 'intakes', 'invoices')

-- 04 removes columns rather than adding them, so "applied" means the
-- columns are gone.
UNION ALL
SELECT '04_drop_inr', 'courses.price_inr removed',
       IF(COUNT(*) = 0, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'price_inr'

UNION ALL
SELECT '05_course_images', 'courses.image_src',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'courses' AND column_name = 'image_src'

UNION ALL
SELECT '06_enquiry_spam', 'enquiries.spam_score',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'enquiries' AND column_name = 'spam_score'

UNION ALL
SELECT '07_account_requests', 'account_requests table',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'account_requests'

UNION ALL
SELECT '08_placement_attempts', 'placement_attempts table',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'placement_attempts'

UNION ALL
SELECT '09_placement_review', 'placement_attempts.detail + final_level',
       IF(COUNT(*) = 2, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'placement_attempts'
   AND column_name IN ('detail', 'final_level')

UNION ALL
SELECT '10_intake_teacher_name', 'intakes.teacher_name',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'intakes' AND column_name = 'teacher_name'

UNION ALL
SELECT '12_student_profile', 'students.avatar + city',
       IF(COUNT(*) = 2, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'students'
   AND column_name IN ('avatar', 'city')

UNION ALL
SELECT '15_batch_links', 'intakes.meeting_url + drive_url + whatsapp_url',
       IF(COUNT(*) = 3, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'intakes'
   AND column_name IN ('meeting_url', 'drive_url', 'whatsapp_url')

UNION ALL
SELECT '16_einbuergerungstest_progress', 'et_progress table',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'et_progress'

UNION ALL
SELECT '17_einbuergerungstest_reports', 'et_reports table',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'et_reports'

UNION ALL
-- Not a new table: admin_users has existed since 02. What 18 adds is
-- everything needed to sign into it, so the check is for the columns
-- rather than the table. token_version is the load-bearing one — no
-- session can be revoked without it — and status is what decides
-- whether somebody may sign in at all.
SELECT '18_teacher_accounts', 'admin_users can be signed into',
       IF(COUNT(*) = 4, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'admin_users'
   AND column_name IN ('status', 'token_version', 'invite_token_hash', 'avatar')

UNION ALL
-- The other half of 18: the password has to be nullable, because the
-- office creates the row before the teacher chooses one.
SELECT '18_teacher_accounts', 'admin_users.password_hash is nullable',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'admin_users'
   AND column_name = 'password_hash' AND is_nullable = 'YES'

UNION ALL
-- A tick box that is checked and then forgotten proves nothing. This is
-- where the acceptance is kept, and it is the record the clauses about
-- who owns the course materials would stand on.
SELECT '19_teacher_terms', 'admin_users records terms acceptance',
       IF(COUNT(*) = 2, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'admin_users'
   AND column_name IN ('terms_accepted_at', 'terms_version')

UNION ALL
SELECT '20_attendance', 'attendance table',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name = 'attendance'

UNION ALL
-- Where a mark came from. A student pressing "Join the class" and a
-- teacher taking the register are not the same claim, and the teacher's
-- must win — which the row can only enforce if it remembers which it is.
SELECT '21_attendance_self', 'attendance.source + lessons.started_at',
       IF(COUNT(*) = 3, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND ((table_name = 'attendance' AND column_name IN ('source', 'joined_at'))
     OR (table_name = 'lessons' AND column_name = 'started_at'))

UNION ALL
SELECT '22_teacher_ref', 'admin_users.teacher_ref, unique',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.statistics
 WHERE table_schema = DATABASE() AND table_name = 'admin_users'
   AND index_name = 'uniq_teacher_ref'

UNION ALL
-- Cover teacher: a batch that one person being ill does not close.
SELECT '23_second_teacher', 'intakes.teacher2_id + teacher2_name',
       IF(COUNT(*) = 2, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'intakes'
   AND column_name IN ('teacher2_id', 'teacher2_name')

UNION ALL
-- Status that follows the dates, unless somebody took it off automatic.
SELECT '24_batch_status_auto', 'intakes.status_auto',
       IF(COUNT(*) = 1, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'intakes'
   AND column_name = 'status_auto'

UNION ALL
-- The weekly pattern, and lessons that can be moved or cancelled.
SELECT '25_timetable', 'intakes.meets_* + lessons.moved_from/generated',
       IF(COUNT(*) = 6, 'yes', 'NO')
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND ((table_name = 'intakes'
         AND column_name IN ('meets_days', 'meets_from', 'meets_minutes'))
     OR (table_name = 'lessons'
         AND column_name IN ('moved_from', 'change_note', 'generated')))

-- UNION ALL happens to return rows in order, but is not promised to.
-- The names are zero-padded, so sorting them puts the list in the
-- order the files must be run.
ORDER BY migration;


-- ── The three that read your data ───────────────────────────────────
--
-- Separate, and last, because these are the only lines in the file that
-- name one of your own tables. If the wrong database is selected this
-- is where it breaks, and by then everything above has already printed.
--
-- 11 and 13 rewrite rows in `courses`; 14 renumbers student references.
-- None of them adds a column, so information_schema cannot answer for
-- them and there is nothing to ask but the data itself.

SELECT '11_course_tracks' AS migration,
       'courses.track filled in' AS adds,
       IF(COUNT(*) >= 1, 'yes', 'NO') AS applied
  FROM courses
 WHERE slug = 'intensive-courses' AND track = 'Intensive'

UNION ALL
SELECT '13_codes_and_fast_track', 'the course is called Fast Track',
       IF(COUNT(*) >= 1, 'yes', 'NO')
  FROM courses
 WHERE slug = 'intensive-courses' AND lang = 'en' AND title = 'Fast Track'

-- 14 is the only one that can read as "not needed": with no students
-- there is nothing for it to rewrite. It says so rather than "NO", so
-- an empty database does not look like a missing migration.
UNION ALL
SELECT '14_codes_unbroken', 'student refs look like LNS0001',
       CASE
         WHEN (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL) = 0
           THEN 'no students yet'
         WHEN (SELECT COUNT(*) FROM students
                WHERE deleted_at IS NULL AND student_ref NOT LIKE 'LNS%') = 0
           THEN 'yes'
         ELSE 'NO'
       END

ORDER BY migration;
