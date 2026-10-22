// ─────────────────────────────────────────────────────────────────────
//  Everyone the office might write to, in one list.
//
//  The compose box asks for an email address and nothing else knows any.
//  Writing to a student meant opening Students, finding them, copying the
//  address, coming back — for somebody whose address the site has had
//  since they signed up.
//
//  Students and teachers only. Enquiries are not here on purpose: an
//  enquiry has its own reply box sitting under the message it answers,
//  which files the reply against it. Offering the same address in two
//  places, one of which forgets, is how a reply goes unrecorded.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");

/** Reads must never take a page down; an empty picker is recoverable. */
async function safe(label, run, fallback) {
  if (!db.isEnabled()) return fallback;
  try {
    return await run();
  } catch (e) {
    console.error(`Contacts: ${label} failed:`, e.message);
    return fallback;
  }
}

/**
 * Everyone reachable, sorted by name.
 *
 * Suspended and closed accounts are left out. A suspended student is one
 * the office has deliberately cut off, and a closed one may have asked to
 * be forgotten; neither belongs in a list whose only purpose is to make
 * writing to somebody one click easier. They are still reachable by
 * typing the address, which is a deliberate speed bump rather than a
 * wall.
 *
 * Deduplicated by address, teachers first, because somebody who is both
 * is being written to as a teacher — and two identical rows in a picker
 * is a picker somebody stops trusting.
 */
async function list() {
  if (!db.isEnabled()) return [];

  const [teachers, students] = await Promise.all([
    safe("contacts.teachers", () => db.query(
      `SELECT name, email FROM admin_users
        WHERE status = 'active' AND email IS NOT NULL AND email <> ''
        ORDER BY name LIMIT 500`), []),
    safe("contacts.students", () => db.query(
      `SELECT name, email FROM students
        WHERE status = 'active' AND deleted_at IS NULL
          AND email IS NOT NULL AND email <> ''
        ORDER BY name LIMIT 1000`), []),
  ]);

  const seen = new Set();
  const out = [];
  const add = (rows, kind) => {
    for (const r of rows || []) {
      const email = String(r.email || "").trim();
      const key = email.toLowerCase();
      if (!email || seen.has(key)) continue;
      seen.add(key);
      out.push({ name: String(r.name || "").trim() || email, email, kind });
    }
  };

  add(teachers, "teacher");
  add(students, "student");

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { list };
