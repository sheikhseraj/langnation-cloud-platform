-- Homework that marks itself.
--
-- The tables `assignments`, `submissions` and `submission_files` have
-- been in this schema since the student portal was built and no code
-- has ever touched them. They were designed for the opposite of this:
-- a text box, a file upload, and a teacher typing points and feedback
-- by hand. That is the marking this is meant to remove. They are left
-- exactly where they are — written homework may want them one day —
-- and nothing here uses them.
--
-- Four tables:
--
--   exercises           one piece of homework. Belongs to a batch, and
--                       optionally to the lesson it follows.
--   exercise_questions  its questions, in order, one row each. The
--                       ANSWER LIVES HERE and never leaves the server:
--                       what reaches a browser is built by stripping
--                       these columns out, exactly as the placement
--                       test does (lib/placement.js).
--   exercise_attempts   one row per go. Practice is unlimited, so a
--                       student may have several; `attempt` numbers
--                       them and the first one is the honest signal of
--                       what they knew before they were told.
--   exercise_answers    what was given, and whether it was right, per
--                       question per attempt. This is what answers the
--                       only question a teacher really needs: which
--                       questions did the class get wrong.
--
-- On `kind`: 'choice' is multiple choice, 'gap' is a typed answer in a
-- blank, 'dropdown' is a choice made inside the sentence. All three
-- mark themselves. Nothing that cannot be marked is storable here,
-- which is deliberate — a question this cannot mark has no business
-- looking like homework that marks itself.
--
-- Pure schema: it creates tables and changes no existing row, so
-- lib/migrate.js applies it at boot without anybody opening phpMyAdmin.
--
-- Safe to re-run.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `exercises` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `intake_id`   INT UNSIGNED NOT NULL,
  --  The lesson this follows, so "the homework from Tuesday" has a
  --  meaning. Nullable: homework does not have to belong to a lesson,
  --  and a lesson being deleted must not take its homework with it.
  `lesson_id`   INT UNSIGNED DEFAULT NULL,
  `title`       VARCHAR(200) NOT NULL,
  --  What students read above the questions.
  `intro`       VARCHAR(500) DEFAULT NULL,
  --  A reading text, shown above the questions that ask about it. This
  --  is the whole difference between a reading exercise and a list of
  --  sentences.
  `passage`     MEDIUMTEXT   DEFAULT NULL,
  --  What the teacher actually typed, kept verbatim.
  --
  --  The questions below are parsed from it and are what gets served.
  --  This is here so the exercise can be EDITED — re-parsing the source
  --  is the only honest way to change question four, and rebuilding the
  --  source from the parsed rows would lose the teacher's layout,
  --  their spacing and any line the parser could not read.
  `source`      MEDIUMTEXT   DEFAULT NULL,
  `skill`       ENUM('grammar','reading','vocabulary','mixed') NOT NULL DEFAULT 'grammar',
  `level`       VARCHAR(10)  DEFAULT NULL,
  `due_on`      DATE         DEFAULT NULL,
  --  Draft until the teacher says otherwise. Homework appearing in a
  --  student's portal half-written is worse than homework appearing
  --  late.
  `published`   TINYINT(1)   NOT NULL DEFAULT 0,
  `created_by`  INT UNSIGNED DEFAULT NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_intake_due` (`intake_id`, `due_on`),
  KEY `idx_lesson` (`lesson_id`),
  CONSTRAINT `fk_ex_intake` FOREIGN KEY (`intake_id`)
    REFERENCES `intakes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ex_lesson` FOREIGN KEY (`lesson_id`)
    REFERENCES `lessons` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ex_creator` FOREIGN KEY (`created_by`)
    REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `exercise_questions` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exercise_id` INT UNSIGNED NOT NULL,
  `seq`         SMALLINT UNSIGNED NOT NULL,
  `kind`        ENUM('choice','gap','dropdown') NOT NULL,
  `prompt`      TEXT NOT NULL,
  --  JSON, because the shape genuinely differs by kind and inventing a
  --  column for each would leave most of them NULL on most rows:
  --    choice   ["bin","bist","ist"]   — the right one FIRST, shuffled
  --                                      when served
  --    dropdown [{"options":["bin","bist"],"answer":0}, …] — one per
  --                                      pair of brackets in the prompt
  --    gap      null
  `options`     JSON DEFAULT NULL,
  --  What a typed answer may be, one list per gap, in order:
  --    [["fahren"],["bleiben","wohnen"]]
  --  A list rather than a string because a teacher can allow
  --  alternatives, and because two gaps in one sentence is ordinary.
  `accept`      JSON DEFAULT NULL,
  --  Shown after the answer is given, right or wrong. Written by the
  --  teacher; nothing here generates one.
  `explain`     TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_exercise_seq` (`exercise_id`, `seq`),
  CONSTRAINT `fk_exq_exercise` FOREIGN KEY (`exercise_id`)
    REFERENCES `exercises` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `exercise_attempts` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exercise_id` INT UNSIGNED NOT NULL,
  `student_id`  INT UNSIGNED NOT NULL,
  --  1, 2, 3 … Practice is unlimited, so this is how often they went
  --  back to it — which is itself worth seeing.
  `attempt`     SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `score`       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `out_of`      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `started_at`  DATETIME NOT NULL,
  `finished_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ex_student_attempt` (`exercise_id`, `student_id`, `attempt`),
  KEY `idx_student` (`student_id`),
  CONSTRAINT `fk_exa_exercise` FOREIGN KEY (`exercise_id`)
    REFERENCES `exercises` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exa_student` FOREIGN KEY (`student_id`)
    REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `exercise_answers` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attempt_id`  INT UNSIGNED NOT NULL,
  `question_id` INT UNSIGNED NOT NULL,
  --  What they actually typed or picked, kept as text. A wrong answer
  --  is more use to a teacher than the fact that it was wrong: six
  --  students writing "komme" for "kommt" is a lesson, and six
  --  different wrong answers is not.
  `given`       TEXT DEFAULT NULL,
  `correct`     TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_attempt_question` (`attempt_id`, `question_id`),
  KEY `idx_question` (`question_id`),
  CONSTRAINT `fk_exans_attempt` FOREIGN KEY (`attempt_id`)
    REFERENCES `exercise_attempts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exans_question` FOREIGN KEY (`question_id`)
    REFERENCES `exercise_questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'exercises, exercise_questions, exercise_attempts, exercise_answers are present' AS note;
