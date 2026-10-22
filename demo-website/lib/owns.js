// ─────────────────────────────────────────────────────────────────────
//  Whose batch this is.
//
//  One line of SQL, in one file, because it is the whole of the
//  teacher portal's security and it used to be copied into four:
//  lib/teaching.js, lib/attendance.js, lib/lessons.js and
//  lib/backlog.js each carried its own version. Four copies of a rule
//  is four chances to change three of them.
//
//  The batch's teacher, and nobody else.
//
//  It used to be the teacher OR intakes.teacher2_id — a standing cover
//  teacher the office named on the batch, with the primary teacher's
//  access to it for the whole term. That was the only answer available
//  before a lesson could be handed to somebody, and it is the wrong
//  shape: a class needs covering on a Thursday, not from September to
//  December, and a teacher who covers one evening was carrying the
//  batch, its class list, its materials and every register in it
//  around on their dashboard for months.
//
//  Cover is now the thing it actually is — one lesson, handed to one
//  person, for one day. That lives on lessons.teacher_id and is spelt
//  out in lib/attendance.js's ownsOnDate() and lib/lessons.js's
//  MAY_TOUCH(). It is deliberately the narrowest permission here: the
//  ROW, not the course.
//
//  intakes.teacher2_id and teacher2_name are left in the database and
//  nothing reads them any more: not this file, not the office form
//  that used to set them, not the student portal that used to print
//  "or <somebody>" beside the teacher's name. Dropping a column is not
//  something to do on the way past, so they stay where they are,
//  holding what they held.
// ─────────────────────────────────────────────────────────────────────
"use strict";

/**
 * The WHERE fragment, with `alias` naming the intakes row.
 *
 * A function rather than a constant so it reads the same as it did
 * when it had to ask the database what columns existed, and so the
 * alias can differ — lib/attendance.js joins intakes as something
 * other than `i` in places.
 */
const OWNS = (alias = "i") => `${alias}.teacher_id = ?`;

/**
 * The parameters OWNS() expects, in order.
 *
 * Kept beside it rather than written out at each call site: when the
 * predicate had two placeholders so did this, and a bind array that is
 * merely the right length can still be the wrong order.
 */
const BINDS = (teacherId) => [teacherId];

module.exports = { OWNS, BINDS };
