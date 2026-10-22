-- Did the timetable generate correctly?
--
-- Read-only. Changes nothing, safe to run at any time, safe to run
-- twice. Run it once after giving a batch its first weekly pattern.
--
-- HOW TO RUN IT:
--   1. click YOUR DATABASE in the left-hand list of phpMyAdmin
--   2. click the SQL tab -- NOT the Import tab
--   3. paste this whole file and press Go
--
-- Not Import: Import runs the statements and discards the results, and
-- the entire output of this file IS a result set.
--
-- Every statement here reads your own tables, so the database has to be
-- selected or the first one fails with
--     #1109 - Unknown table 'intakes' in information_schema
-- The first statement says which database it is pointed at, so a wrong
-- one is visible before the error rather than after it.
--
-- No number in the filename: this is not a migration and must never be
-- run as part of the sequence.
--
-- ── Why this exists ─────────────────────────────────────────────────
--
-- lib/lessons.js turns "Monday to Friday, 09:00, two hours" into one
-- row per date. It is covered by tests, but those tests stub the
-- database -- they prove the rules, not this database. The generator
-- also runs every ten minutes forever, so the first thing worth
-- knowing is whether its first run did what it was supposed to.


-- ── 0. Which database is this? ──────────────────────────────────────

SELECT
  DATABASE() AS `running against`,
  IF(DATABASE() IS NULL OR DATABASE() = 'information_schema',
     'WRONG - pick your own database in the left-hand list, then run this again',
     'looks right') AS `is that your database?`;


-- ── 1. Every batch with a pattern, and what came of it ──────────────
--
-- `generated` are rows lib/lessons.js made. `by_hand` are rows it did
-- not -- lessons created by a register being taken before the timetable
-- existed, which are real history and which the generator is forbidden
-- to touch.
--
-- `distinct_times` is the interesting one and it is NOT a fault when it
-- is 2. A batch running from September to December crosses the October
-- clock change: 09:00 in Berlin is 07:00 UTC in summer and 08:00 in
-- winter, and the column stores the instant. Two distinct stored times
-- across that boundary is the conversion working. One distinct time
-- across it would mean every lesson after October is an hour out.

SELECT
  i.code                              AS batch,
  i.timezone,
  i.meets_days                        AS `days (1=Mon)`,
  i.meets_from                        AS `starts (wall clock)`,
  i.meets_minutes                     AS mins,
  i.starts_on, i.ends_on,
  COUNT(l.id)                         AS lessons,
  SUM(l.generated = 1)                AS generated,
  SUM(l.generated = 0)                AS by_hand,
  SUM(l.status = 'held')              AS held,
  SUM(l.status = 'cancelled')         AS cancelled,
  SUM(l.moved_from IS NOT NULL)       AS moved,
  MIN(DATE(l.starts_at))              AS first_lesson,
  MAX(DATE(l.starts_at))              AS last_lesson,
  COUNT(DISTINCT TIME(l.starts_at))   AS distinct_times
FROM intakes i
LEFT JOIN lessons l ON l.intake_id = i.id
WHERE i.meets_days IS NOT NULL AND i.meets_days <> ''
GROUP BY i.id, i.code, i.timezone, i.meets_days, i.meets_from,
         i.meets_minutes, i.starts_on, i.ends_on
ORDER BY i.starts_on DESC;


-- ── 2. What time is actually stored, and how many at each ───────────
--
-- The column is UTC -- the pool runs with timezone "Z" -- so these are
-- NOT the times anybody sees. For a 09:00 Europe/Berlin class expect
-- 07:00:00 for the summer lessons and 08:00:00 for the winter ones.
--
-- A third time, or a time that is neither, means the conversion went
-- wrong and every lesson at it is at the wrong hour.

SELECT
  i.code                AS batch,
  i.timezone,
  i.meets_from          AS `should read as`,
  TIME(l.starts_at)     AS `stored (UTC)`,
  COUNT(*)              AS lessons,
  MIN(DATE(l.starts_at)) AS `from`,
  MAX(DATE(l.starts_at)) AS `to`
FROM lessons l
JOIN intakes i ON i.id = l.intake_id
WHERE i.meets_days IS NOT NULL AND i.meets_days <> ''
  AND l.generated = 1
GROUP BY i.id, i.code, i.timezone, i.meets_from, TIME(l.starts_at)
ORDER BY i.code, TIME(l.starts_at);


-- ── 3. Anything on a day the pattern does not include ───────────────
--
-- This is the real correctness check: a generated lesson should only
-- ever fall on one of the batch's own days.
--
-- MySQL's WEEKDAY() is 0 for Monday; meets_days is ISO, where Monday is
-- 1. Hence the +1.
--
-- Moved lessons are excluded, because a teacher moving Thursday's class
-- to a Saturday is the feature working, not a fault.
--
-- One caveat worth knowing: WEEKDAY() reads the stored UTC datetime, so
-- for a class late enough in the evening to fall on the previous day in
-- UTC this could report a false alarm. At 09:00 it cannot.
--
-- An empty result is the right answer.

SELECT
  i.code                AS batch,
  l.id                  AS lesson_id,
  l.title,
  DATE(l.starts_at)     AS on_date,
  DAYNAME(l.starts_at)  AS on_day,
  i.meets_days          AS `pattern days`
FROM lessons l
JOIN intakes i ON i.id = l.intake_id
WHERE l.generated = 1
  AND l.moved_from IS NULL
  AND i.meets_days IS NOT NULL AND i.meets_days <> ''
  AND FIND_IN_SET(WEEKDAY(l.starts_at) + 1, i.meets_days) = 0
ORDER BY l.starts_at
LIMIT 50;


-- ── 4. Two lessons on the same day for the same batch ───────────────
--
-- The generator treats a date as covered if a lesson sits on it OR was
-- moved from it, so it should never produce a second one. A duplicate
-- here means a register created a lesson the generator then failed to
-- recognise -- worth knowing about, because attendance would be split
-- across the two.
--
-- An empty result is the right answer.

SELECT
  i.code              AS batch,
  DATE(l.starts_at)   AS on_date,
  COUNT(*)            AS lessons,
  GROUP_CONCAT(l.id ORDER BY l.id)          AS lesson_ids,
  GROUP_CONCAT(TIME(l.starts_at) ORDER BY l.id) AS times
FROM lessons l
JOIN intakes i ON i.id = l.intake_id
GROUP BY i.id, i.code, DATE(l.starts_at)
HAVING COUNT(*) > 1
ORDER BY on_date DESC
LIMIT 50;


-- ── 5. Registers not taken ──────────────────────────────────────────
--
-- The same question lib/backlog.js asks, so the office can see it
-- without waiting for the escalation panel. A past lesson with no
-- TEACHER mark against it is a register somebody still owes.
--
-- `self_marks` is how many students marked themselves present by
-- joining through the portal. A row with students who joined and no
-- teacher mark is the case worth understanding: the class plainly
-- happened, and nobody wrote down who was in it.

SELECT
  i.code                          AS batch,
  DATE(l.starts_at)               AS on_date,
  l.title,
  COALESCE(t.name, i.teacher_name, 'not assigned') AS teacher,
  (SELECT COUNT(*) FROM enrolments e
    WHERE e.intake_id = i.id AND e.status = 'active') AS students,
  (SELECT COUNT(*) FROM attendance a
    WHERE a.lesson_id = l.id AND a.source = 'self')   AS self_marks,
  DATEDIFF(CURDATE(), DATE(l.starts_at))              AS days_ago
FROM lessons l
JOIN intakes i ON i.id = l.intake_id
LEFT JOIN admin_users t ON t.id = i.teacher_id
WHERE l.status <> 'cancelled'
  AND l.starts_at < DATE_SUB(NOW(), INTERVAL 3 HOUR)
  AND NOT EXISTS (
    SELECT 1 FROM attendance a
     WHERE a.lesson_id = l.id AND a.source = 'teacher'
  )
ORDER BY l.starts_at
LIMIT 100;
