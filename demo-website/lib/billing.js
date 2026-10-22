// ─────────────────────────────────────────────────────────────────────
//  What a student owes, what they have paid, and when the rest is due.
//
//  An instalment is an invoice. See MySQL/33_instalments.sql for why:
//  briefly, the school owes the student a Rechnung for every amount it
//  asks them to pay, so a payment plan is already a set of invoices,
//  and a second table claiming to know the same balance would sooner
//  or later disagree with the first.
//
//  ── Money is never a float here ─────────────────────────────────────
//
//  Everything is worked in whole cents. The database stores
//  DECIMAL(10,2) and mysql2 hands those back as STRINGS precisely so
//  they do not go through a double on the way; turning them into
//  Numbers to add up is how 0.1 + 0.2 ends up on an invoice. Amounts
//  cross this module's boundary as integers and are turned back into
//  decimal strings only when they are written or printed.
//
//  ── Status is derived, never stored ─────────────────────────────────
//
//  "Overdue" is not a fact about an invoice, it is a fact about an
//  invoice AND today. Stored, it is wrong every morning until some job
//  runs, and the one morning the job does not run it is wrong all day
//  in front of a customer. The only states written down are the ones
//  that are really events — issued, part paid, paid, void — and the
//  rest are worked out when somebody looks.
//
//  ── Nothing is ever edited or deleted ───────────────────────────────
//
//  An issued invoice carries `locked_at` and is read-only after that;
//  a payment row is append-only and a correction is a negative row.
//  Getting an amount wrong is fixed with a Storno and a reissue, which
//  is what the law expects and what anybody reading the account later
//  needs to see. There is deliberately no update() and no remove() in
//  this file.
// ─────────────────────────────────────────────────────────────────────
"use strict";

const db = require("./db");
const site = require("./site");
const billingAddress = require("./billing-address");

/**
 * LN-2026-000001.
 *
 * The series and the width are settings, because an accountant may
 * already have a convention; the counter behind them is gapless
 * whichever they are, because it is claimed inside the transaction
 * that writes the invoice.
 *
 * Numbers already handed out keep the shape they were given. A
 * sequence is not required to look the same for ever — it is required
 * not to repeat and not to have holes — and rewriting issued numbers
 * to match a new format is exactly the kind of tidying a tax audit
 * treats as tampering.
 */
function invoiceNumber(year, n) {
  const p = site.invoice.prefix ? `${site.invoice.prefix}-` : "";
  return `${p}${year}-${String(n).padStart(site.invoice.digits, "0")}`;
}

/**
 * The issuer and the customer, frozen onto the invoice.
 *
 * These columns have been in the schema from the start and nothing
 * ever wrote to them, so every invoice was rebuilt from whatever the
 * settings and the students table happened to say today. People move
 * and companies rename themselves; an issued invoice that quietly
 * says something different from the one somebody was sent is the
 * problem the columns exist to prevent.
 *
 * Taken at the moment of issue, not of drafting: a draft is still
 * being decided and may sit for a week.
 */
function snapshot(who) {
  const i = site.invoice.issuer;
  /* Without a street and a town there is no address, whatever the
     country field says. It defaults to "Germany", and joining it
     unconditionally froze the single word "Germany" onto invoices as
     though it were the school's address. */
  const where = [i.street, [i.postcode, i.city].filter(Boolean).join(" ")]
    .map((x) => String(x || "").trim()).filter(Boolean);
  const sellerLines = where.length
    ? [i.legal, ...where, i.country].map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  /* The columns students actually has: one free-text `address`, plus
     `city` (added by migration 12) and `country`. No postcode field
     exists, so none is invented -- whatever the student typed into
     the profile address is used unless a separate invoice recipient/address was saved. */
  const billTo = billingAddress.recipient(who);
  return {
    /* The LEGAL name only. It used to fall back to the trading name,
       which put "LangNation Sprachschule" on the line §14 UStG
       reserves for the registered entity -- a plausible value in the
       one place a plausible value is worse than a blank. */
    seller_name: i.legal || null,
    seller_address: sellerLines.join(", ") || null,
    seller_tax_id: i.taxNumber || i.vatId || null,
    billing_name: billTo.name || null,
    billing_address: billTo.address || null,
    tax_note: site.invoice.taxNote || null,
  };
}

/**
 * The customer, as they stand right now.
 *
 * city arrived in migration 12, so a database that has not run it
 * must give a shorter address rather than throw: an invoice is a
 * legal document and a missing optional column is not a reason to
 * fail to issue one.
 */
async function customer(t, studentId) {
  const extra = billingAddress.columns();
  const row = await t.queryOne(
    `SELECT id, name, student_ref, address, country${extra} FROM students WHERE id = ?`,
    [studentId]
  );
  return row || {};
}

/** How long before a due date the student is told about it. */
const SOON_DAYS = 14;

/** Only these can be recorded by hand. The column allows more. */
const METHODS = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
};

/* The ones the schema already allows but no human records: an online
   provider would write these itself. Listed so a label exists the day
   one does, rather than a raw enum value appearing on a student's
   page. */
const ALL_METHODS = Object.assign({}, METHODS, {
  sepa_direct_debit: "SEPA direct debit",
  card: "Card",
  other: "Other",
});

/**
 * A money string to whole cents.
 *
 * The column is DECIMAL(10,2), so the biggest value possible is
 * 9,999,999,999 cents — comfortably inside a safe integer, and a
 * two-decimal string times 100 lands exactly on one. Parsing the
 * string rather than trusting arithmetic on the way in is the point:
 * nothing in this file ever adds two Numbers that represent money.
 */
function cents(v) {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  const whole = Number(m[2]) * 100;
  const frac = m[3] ? Number((m[3] + "0").slice(0, 2)) : 0;
  return (m[1] === "-" ? -1 : 1) * (whole + frac);
}

/** Whole cents back to the string the database column wants. */
function amount(c) {
  const n = Math.trunc(Number(c) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * A date column as YYYY-MM-DD.
 *
 * Compared as strings everywhere below, which keeps every comparison
 * out of timezones: mysql2 may hand back a Date built in the server's
 * zone, and "is this due today" must not change answer because the
 * process runs in Berlin and the database thinks in UTC.
 */
function day(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

const todayStr = () => day(new Date());

/** YYYY-MM-DD, n days on. */
function plus(from, n) {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Where one invoice stands, today.
 *
 * Returns a state and, separately, whether anything has been paid
 * towards it — because "part paid and overdue" is one invoice and two
 * facts, and collapsing them loses the one the student needs.
 */
function stateOf(inv, on) {
  const now = on || todayStr();
  const total = cents(inv.total);
  const paid = cents(inv.paid_amount);
  const owed = total - paid;
  const due = day(inv.due_on);
  const base = {
    total,
    paid,
    owed: owed > 0 ? owed : 0,
    over: owed < 0 ? -owed : 0,
    due,
    partial: paid > 0 && owed > 0,
  };

  /* A credit note is not a debt and a void invoice is not one either.
     Both are kept and shown, because they are part of the account. */
  if (inv.kind === "storno") return Object.assign(base, { state: "credit", owed: 0 });
  if (inv.status === "void") return Object.assign(base, { state: "void", owed: 0 });
  if (inv.status === "draft") return Object.assign(base, { state: "draft" });
  if (owed <= 0) return Object.assign(base, { state: "paid" });
  if (due && due < now) return Object.assign(base, { state: "overdue" });
  if (due && due <= plus(now, SOON_DAYS)) return Object.assign(base, { state: "due" });
  return Object.assign(base, { state: "upcoming" });
}

/** The words, so colour is never the only thing carrying the state. */
const STATE_LABEL = {
  paid: "Paid",
  overdue: "Overdue",
  due: "Due soon",
  upcoming: "Upcoming",
  draft: "Draft",
  void: "Cancelled",
  credit: "Credit note",
};

/**
 * One enrolment's plan: its invoices, each with where it stands, and
 * the totals across them.
 *
 * The totals are summed from the rows rather than kept anywhere. A
 * figure that counts on its own eventually disagrees with the list it
 * claims to summarise, and the figure is the one people believe.
 */
function summarise(rows, on) {
  const now = on || todayStr();
  const parts = (rows || []).map((r) => Object.assign({}, r, stateOf(r, now)));

  /* Credit notes come off the total; cancelled invoices are not in it
     at all. A Storno carries the negative of what it cancels, so
     adding it is the whole of the correction. */
  const counts = parts.filter((p) => p.state !== "void" && p.state !== "draft");
  const total = counts.reduce((n, p) => n + (p.state === "credit" ? -Math.abs(p.total) : p.total), 0);
  const paid = counts.reduce((n, p) => n + (p.state === "credit" ? -Math.abs(p.paid) : p.paid), 0);
  const owed = total - paid > 0 ? total - paid : 0;

  const unpaid = parts.filter((p) => p.owed > 0 && p.state !== "draft");
  const overdue = unpaid.filter((p) => p.state === "overdue");
  const next = unpaid
    .filter((p) => p.state !== "overdue" && p.due)
    .sort((a, b) => (a.due < b.due ? -1 : 1))[0] || null;

  let state = "pending";
  if (!counts.length) state = parts.some((p) => p.state === "draft") ? "draft" : "none";
  else if (owed <= 0) state = "paid";
  else if (overdue.length) state = "overdue";
  else if (paid > 0) state = "part_paid";

  return {
    parts,
    total,
    paid,
    owed,
    state,
    overdue,
    overdueAmount: overdue.reduce((n, p) => n + p.owed, 0),
    next,
    /* An instalment plan is more than one invoice. One invoice is a
       course fee, and showing a one-row "plan" table for it is three
       headings over a number the card above already gave. */
    planned: counts.filter((p) => p.state !== "credit").length > 1,
  };
}

const SUMMARY_STATE = {
  draft: "Drafted, not issued",
  paid: "Paid in full",
  part_paid: "Partially paid",
  overdue: "Overdue",
  pending: "Pending",
  none: "Nothing billed yet",
};

/* The columns every read below wants, and the joins that name the
   course an invoice paid for. LEFT, because an invoice need not belong
   to a course at all. */
const INVOICE_COLS = `i.id, i.number, i.kind, i.currency, i.total, i.paid_amount,
        i.status, i.issued_on, i.due_on, i.paid_on, i.enrolment_id,
        i.instalment_no, i.instalment_of,
        k.code AS batch_code, c.title AS course_title`;
const INVOICE_FROM = `FROM invoices i
         LEFT JOIN enrolments e ON e.id = i.enrolment_id
         LEFT JOIN intakes k ON k.id = e.intake_id
         LEFT JOIN courses c ON c.id = k.course_id AND c.lang = 'en'`;

/**
 * Everything one student owes, grouped by the course it is for.
 *
 * Drafts are left out: a draft is the office still deciding, and
 * showing one invites a question about a number that may yet change.
 */
async function forStudent(studentId, on, { drafts = false } = {}) {
  if (!db.isEnabled()) return [];
  /* Drafts are hidden from the STUDENT and shown to the office.
   *
   * This was one query serving both, and the office got the student's
   * answer: a plan drafted and never issued was invisible on the page
   * that was supposed to issue it, so the Drafted card could not
   * render, the setup form came back as though nothing existed, and
   * drafting again was refused by a guard pointing at invoices nobody
   * could see. Whoever is reading decides. */
  const rows = await db.query(
    `SELECT ${INVOICE_COLS}
       ${INVOICE_FROM}
      WHERE i.student_id = ?${drafts ? "" : " AND i.status <> 'draft'"}
      ORDER BY i.enrolment_id IS NULL, i.enrolment_id,
               i.due_on IS NULL, i.due_on, i.id`,
    [studentId]
  );

  const groups = new Map();
  for (const r of rows) {
    const key = r.enrolment_id === null ? "other" : String(r.enrolment_id);
    if (!groups.has(key)) {
      groups.set(key, {
        enrolmentId: r.enrolment_id,
        course: r.course_title || null,
        batch: r.batch_code || null,
        currency: r.currency || "EUR",
        rows: [],
      });
    }
    groups.get(key).rows.push(r);
  }

  /* An invoice with no enrolment is the combined plan: one schedule
     covering everything the student is taking. It names the courses
     on its own lines rather than belonging to one of them, which is
     how a real invoice for two things is written. */
  const out = [...groups.values()].map((g) =>
    Object.assign(g, summarise(g.rows, on), {
      label: g.course || "All courses",
      combined: g.enrolmentId === null,
    })
  );
  if (!out.length) return out;

  const lines = await db.query(
    `SELECT it.invoice_id, it.description, it.amount
       FROM invoice_items it
       JOIN invoices i ON i.id = it.invoice_id
      WHERE i.student_id = ? AND i.enrolment_id IS NULL${drafts ? "" : " AND i.status <> 'draft'"}
      ORDER BY it.invoice_id, it.sort_order, it.id`,
    [studentId]
  );
  if (lines.length) {
    const byInvoice = new Map();
    for (const l of lines) {
      const k = String(l.invoice_id);
      if (!byInvoice.has(k)) byInvoice.set(k, []);
      byInvoice.get(k).push({ description: l.description, amount: cents(l.amount) });
    }
    for (const g of out) {
      if (!g.combined) continue;
      for (const p of g.parts) p.lines = byInvoice.get(String(p.id)) || [];
    }
  }
  return out;
}

/** Everything the student needs told about on the dashboard, or null. */
async function alertFor(studentId, on) {
  const plans = await forStudent(studentId, on);
  const overdue = plans.filter((p) => p.state === "overdue");
  if (overdue.length) {
    const worst = overdue[0];
    return {
      level: "overdue",
      amount: worst.overdueAmount,
      currency: worst.currency,
      on: worst.overdue[0] ? worst.overdue[0].due : null,
      course: worst.label,
    };
  }
  /* Only what is actually near. A reminder about something ten weeks
     out is not a reminder, it is furniture, and furniture is what
     people stop reading. */
  const soon = plans
    .filter((p) => p.next && p.next.state === "due")
    .sort((a, b) => (a.next.due < b.next.due ? -1 : 1))[0];
  if (!soon) return null;
  return {
    level: "due",
    amount: soon.next.owed,
    currency: soon.currency,
    on: soon.next.due,
    course: soon.label,
  };
}

/**
 * Split a total into n instalments that add back up to it.
 *
 * The remainder goes on the FIRST one, not the last. Rounding 1000
 * into three leaves a cent somewhere, and a school would rather take
 * it early than have the final invoice be the odd one — and a student
 * reading a plan notices a strange number at the bottom more than one
 * at the top.
 */
function split(totalCents, n) {
  const count = Math.max(1, Math.trunc(n));
  const each = Math.floor(totalCents / count);
  const rest = totalCents - each * count;
  return Array.from({ length: count }, (_, i) => each + (i === 0 ? rest : 0));
}

/**
 * Split a total between several things in proportion to their size.
 *
 * Used when one instalment covers more than one course: the student
 * pays 500 and the school needs to know how much of it was for which
 * course, because that is what the invoice line says and what the
 * books are kept by.
 *
 * The remainder goes on the largest share rather than the first, so a
 * stray cent lands where it is least visible against the number
 * beside it. Weights that are all zero fall back to an even split,
 * which is the only sensible answer and beats dividing by nothing.
 */
function share(totalCents, weights) {
  const w = (weights || []).map((x) => Math.max(0, Math.trunc(x) || 0));
  if (!w.length) return [];
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return split(totalCents, w.length);

  const out = w.map((x) => Math.floor((totalCents * x) / sum));
  const rest = totalCents - out.reduce((a, b) => a + b, 0);
  if (rest) {
    let biggest = 0;
    for (let i = 1; i < w.length; i += 1) if (w[i] > w[biggest]) biggest = i;
    out[biggest] += rest;
  }
  return out;
}

/** Monthly from a first date, same day of the month where it exists. */
function monthly(first, n) {
  const start = new Date(`${first}T00:00:00Z`);
  const dom = start.getUTCDate();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    /* The 31st of a month that has 30 days becomes its last day rather
       than rolling into the next one, which is what JavaScript's own
       date arithmetic would do and what would silently move an
       instalment out of the month it was promised for. */
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dom, last));
    return d.toISOString().slice(0, 10);
  });
}

/* ── Writing ────────────────────────────────────────────────────────
 *
 * Three things happen to money here and all three are appends.
 *
 * A plan is DRAFTED as a set of invoices nobody has seen, which is the
 * stage at which amounts and dates can be moved around freely. ISSUING
 * it hands out the numbers and locks it. After that a wrong amount is
 * corrected with a Storno and a reissue, never by editing a row, which
 * is what the law expects and what anybody reading the account later
 * needs to see.
 *
 * Recording a payment inserts a row and recomputes the invoice it
 * belongs to from the sum of its payments — not by adding to a running
 * total, which drifts the first time anything is retried.
 */

/**
 * One line in the audit log, for a thing that moved money.
 *
 * `audit_log` was in the schema from the start with a comment saying
 * why: money and grades get disputed, and "the system says so" is not
 * an answer. Until now nothing in this feature wrote to it.
 *
 * Takes the open transaction, so the log entry and the thing it
 * describes commit together or not at all. A log that can be written
 * without the change — or worse, a change that can be written without
 * the log — is a log nobody can rely on in an argument.
 *
 * actor_type is 'staff' and actor_id is null, honestly: the office
 * signs in with one shared password, so the application knows a
 * member of staff did this and genuinely does not know which. See the
 * note in routes/admin.js.
 */
function note(t, action, entity, entityId, detail, ip) {
  return t.query(
    `INSERT INTO audit_log (actor_type, actor_id, action, entity, entity_id, detail, ip)
     VALUES ('staff', NULL, ?, ?, ?, ?, ?)`,
    [action, entity, entityId, JSON.stringify(detail || {}), ip || null]
  );
}

/** What the caller got wrong, as something a person can read. */
class BillingError extends Error {
  constructor(message) {
    super(message);
    this.name = "BillingError";
    this.expected = true;
  }
}

const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/**
 * Draft a payment plan against one enrolment.
 *
 * `parts` is [{ amount, due_on }] in cents. Validated as a set, not
 * one at a time: the thing that matters is that they add up to the fee
 * the student was quoted, and an instalment that is individually
 * plausible can still leave a plan 200 euros short.
 */
/* memo, not note: `note` is the audit-log writer at the top of this
   file, and a parameter by that name shadowed it -- so drafting a
   plan called a string. Renamed rather than the function, because the
   function is used in five places and this is used in one. */
async function draftPlan(enrolmentId, { parts, currency = "EUR", createdBy = null, note: memo = null }) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");
  if (!Array.isArray(parts) || !parts.length) throw new BillingError("A plan needs at least one instalment.");
  if (parts.length > 24) throw new BillingError("That is more instalments than a course has months.");

  parts.forEach((p, i) => {
    if (!Number.isInteger(p.amount) || p.amount <= 0) {
      throw new BillingError(`Instalment ${i + 1} must be more than zero.`);
    }
    if (!isDate(p.due_on)) throw new BillingError(`Instalment ${i + 1} needs a due date.`);
  });

  const enrol = await db.queryOne(
    `SELECT e.id, e.student_id, k.code AS batch_code, c.title AS course_title
       FROM enrolments e
       LEFT JOIN intakes k ON k.id = e.intake_id
       LEFT JOIN courses c ON c.id = k.course_id AND c.lang = 'en'
      WHERE e.id = ?`,
    [enrolmentId]
  );
  if (!enrol) throw new BillingError("That enrolment does not exist.");

  /* One plan per enrolment. A second one drafted beside the first is
     how a student ends up billed twice for the same course, and the
     office would have no way of telling which of the two was real. */
  const already = await db.queryOne(
    "SELECT COUNT(*) AS n FROM invoices WHERE enrolment_id = ? AND status <> 'void'",
    [enrolmentId]
  );
  if (already && Number(already.n) > 0) {
    /* Saying which. "Already has invoices" sent somebody looking for
       invoices that were drafts, on a page that was not showing
       drafts, with no way out of either. */
    const open = await db.queryOne(
      "SELECT COUNT(*) AS n FROM invoices WHERE enrolment_id = ? AND status = 'draft'",
      [enrolmentId]
    );
    throw new BillingError(open && Number(open.n) === Number(already.n)
      ? "There is already a plan drafted for this course. Issue it or discard it first."
      : "This course has already been invoiced. A change to an issued invoice is a credit note.");
  }

  const of = parts.length;
  const what = enrol.course_title || "Course fee";

  return db.transaction(async (t) => {
    const ids = [];
    for (let i = 0; i < of; i += 1) {
      const p = parts[i];
      const res = await t.query(
        `INSERT INTO invoices
           (student_id, enrolment_id, instalment_no, instalment_of, currency,
            subtotal, total, status, due_on, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        [enrol.student_id, enrolmentId, i + 1, of, currency,
         amount(p.amount), amount(p.amount), p.due_on, memo, createdBy]
      );
      const id = res.insertId;
      ids.push(id);
      await t.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, sort_order)
         VALUES (?, ?, 1.00, ?, ?, 0)`,
        [id, of > 1 ? `${what} — instalment ${i + 1} of ${of}` : what,
         amount(p.amount), amount(p.amount)]
      );
    }
    await note(t, "plan.drafted", "student", enrol.student_id,
      { enrolment_id: enrolmentId, instalments: of }, null);
    return { enrolmentId, studentId: enrol.student_id, invoiceIds: ids, of };
  });
}

/**
 * Draft ONE plan covering several enrolments.
 *
 * The invoices carry no single enrolment, because they do not belong
 * to one: each carries a line per course instead, which is how an
 * invoice for two things has always been written and keeps the money
 * attributable to the course that earned it.
 *
 * Refused if anything is already billed. A combined plan beside a
 * per-course one is the same student billed twice, and the office
 * would have no way of telling which of the two was real.
 */
async function draftCombined(studentId, { parts, courses, currency = "EUR", createdBy = null }) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");
  if (!Array.isArray(parts) || !parts.length) throw new BillingError("A plan needs at least one instalment.");
  if (parts.length > 24) throw new BillingError("That is more instalments than a course has months.");
  if (!Array.isArray(courses) || courses.length < 2) {
    throw new BillingError("A combined plan needs at least two courses.");
  }
  parts.forEach((p, i) => {
    if (!Number.isInteger(p.amount) || p.amount <= 0) {
      throw new BillingError(`Instalment ${i + 1} must be more than zero.`);
    }
    if (!isDate(p.due_on)) throw new BillingError(`Instalment ${i + 1} needs a due date.`);
  });

  const already = await db.queryOne(
    "SELECT COUNT(*) AS n FROM invoices WHERE student_id = ? AND status <> 'void'",
    [studentId]
  );
  if (already && Number(already.n) > 0) {
    const open = await db.queryOne(
      "SELECT COUNT(*) AS n FROM invoices WHERE student_id = ? AND status = 'draft'",
      [studentId]
    );
    throw new BillingError(open && Number(open.n) === Number(already.n)
      ? "There is already a plan drafted for this student. Issue it or discard it first."
      : "This student has already been invoiced. A change to an issued invoice is a credit note.");
  }

  const weights = courses.map((c) => Math.max(0, Number(c.fee) || 0));
  const of = parts.length;

  return db.transaction(async (t) => {
    const ids = [];
    for (let i = 0; i < of; i += 1) {
      const p = parts[i];
      const res = await t.query(
        `INSERT INTO invoices
           (student_id, enrolment_id, instalment_no, instalment_of, currency,
            subtotal, total, status, due_on, created_by)
         VALUES (?, NULL, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [studentId, i + 1, of, currency, amount(p.amount), amount(p.amount), p.due_on, createdBy]
      );
      ids.push(res.insertId);

      /* Each instalment is divided between the courses in proportion
         to what each one costs, so every line of every invoice adds
         back up to that instalment and the set of them adds up to the
         fee. */
      const cut = share(p.amount, weights);
      for (let j = 0; j < courses.length; j += 1) {
        await t.query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, sort_order)
           VALUES (?, ?, 1.00, ?, ?, ?)`,
          [res.insertId,
           of > 1 ? `${courses[j].title} — instalment ${i + 1} of ${of}` : courses[j].title,
           amount(cut[j]), amount(cut[j]), j]
        );
      }
    }
    await note(t, "plan.drafted", "student", studentId,
      { combined: true, courses: courses.length, instalments: of }, null);
    return { studentId, invoiceIds: ids, of };
  });
}

/**
 * Throw away a drafted plan.
 *
 * Deleted outright, and only drafts. A draft has no number, was never
 * issued, and the student has never seen it — it is a proposal, not a
 * record of anything, and keeping a withdrawn proposal for ever is
 * clutter rather than an audit trail. Everything that IS a record is
 * append-only and cannot reach this function: the WHERE clause names
 * the status, so an issued invoice is not deletable by any argument
 * passed in here.
 *
 * Logged anyway, because somebody drafting and discarding the same
 * plan four times is worth being able to see.
 */
async function discardDrafts(studentId, { enrolmentId = null, ip = null } = {}) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");

  return db.transaction(async (t) => {
    const open = await t.query(
      enrolmentId
        ? "SELECT id FROM invoices WHERE enrolment_id = ? AND status = 'draft'"
        : "SELECT id FROM invoices WHERE student_id = ? AND status = 'draft'",
      [enrolmentId || studentId]
    );
    if (!open.length) throw new BillingError("There is nothing drafted to discard.");

    const ids = open.map((r) => r.id);
    const holes = ids.map(() => "?").join(", ");
    /* Belt and braces: the status is named again here, so even a bug
       in the select above cannot delete something that was issued. */
    await t.query(`DELETE FROM invoice_items WHERE invoice_id IN (${holes})`, ids);
    await t.query(`DELETE FROM invoices WHERE id IN (${holes}) AND status = 'draft'`, ids);

    await note(t, "plan.discarded", "student", studentId,
      { invoices: ids.length, enrolment_id: enrolmentId }, ip);

    return { discarded: ids.length };
  });
}

/** A whole student's drafts, issued together. */
async function issueForStudent(studentId, { issuedOn = null } = {}) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");
  const on = issuedOn || todayStr();
  if (!isDate(on)) throw new BillingError("That is not a valid issue date.");

  return db.transaction(async (t) => {
    const drafts = await t.query(
      `SELECT id FROM invoices WHERE student_id = ? AND status = 'draft'
        ORDER BY instalment_no, id`,
      [studentId]
    );
    if (!drafts.length) throw new BillingError("There is nothing drafted to issue.");
    const year = Number(on.slice(0, 4));
    /* Frozen here, at issue, and not at drafting: a draft is still
       being decided and may sit for a week before anybody sends it. */
    const snap = snapshot(await customer(t, studentId));
    for (const d of drafts) {
      await t.query(
        `INSERT INTO invoice_counters (series, year, last_number) VALUES ('invoice', ?, 1)
         ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
        [year]
      );
      const row = await t.queryOne(
        "SELECT last_number FROM invoice_counters WHERE series = 'invoice' AND year = ?", [year]
      );
      await t.query(
        `UPDATE invoices
            SET number = ?, status = 'issued', issued_on = ?, locked_at = NOW(),
                seller_name = ?, seller_address = ?, seller_tax_id = ?,
                billing_name = ?, billing_address = ?, tax_note = ?
          WHERE id = ? AND status = 'draft'`,
        [invoiceNumber(year, row.last_number), on,
         snap.seller_name, snap.seller_address, snap.seller_tax_id,
         snap.billing_name, snap.billing_address, snap.tax_note, d.id]
      );
    }
    await note(t, "plan.issued", "student", studentId, { invoices: drafts.length }, null);
    return { issued: drafts.length };
  });
}

/**
 * Billed, issued and paid, in one go.
 *
 * The ordinary path is four steps — work out a plan, create the
 * drafts, issue them, record what arrived — and all four earn their
 * place when money is going to come in over three months. For a
 * student who has already handed over the whole fee in cash they are
 * four steps to write down one fact, and the office will stop doing
 * it.
 *
 * So this does the lot: one invoice, issued with its number, and the
 * payment against it. In ONE transaction, because a half-finished
 * version of this is an issued invoice for money the school has
 * already taken — which is worse than not having recorded it at all.
 *
 * It takes exactly the same route through the ledger as everything
 * else. There is no "mark as paid" flag anywhere: the invoice is
 * settled because a payment row says so, the same way an online
 * provider's webhook would settle it one day.
 */
async function settle(studentId, {
  enrolmentId = null, courses = null, totalCents, method, receivedOn,
  reference = null, note: memo = null, createdBy = null, currency = "EUR", ip = null,
}) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new BillingError("The fee has to be more than zero.");
  }
  if (!Object.prototype.hasOwnProperty.call(METHODS, method)) {
    throw new BillingError("That is not a payment method we take by hand.");
  }
  if (!isDate(receivedOn)) throw new BillingError("That is not a valid payment date.");
  if (receivedOn > todayStr()) throw new BillingError("A payment cannot have arrived in the future.");

  const already = await db.queryOne(
    enrolmentId
      ? "SELECT COUNT(*) AS n FROM invoices WHERE enrolment_id = ? AND status <> 'void'"
      : "SELECT COUNT(*) AS n FROM invoices WHERE student_id = ? AND status <> 'void'",
    [enrolmentId || studentId]
  );
  if (already && Number(already.n) > 0) {
    throw new BillingError("This is already billed. Record the payment against the invoice instead.");
  }

  const lines = Array.isArray(courses) && courses.length
    ? courses
    : [{ title: "Course fee", fee: totalCents }];
  const cut = share(totalCents, lines.map((c) => Math.max(0, Number(c.fee) || 0)));
  const year = Number(receivedOn.slice(0, 4));

  return db.transaction(async (t) => {
    await t.query(
      `INSERT INTO invoice_counters (series, year, last_number) VALUES ('invoice', ?, 1)
       ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
      [year]
    );
    const seq = await t.queryOne(
      "SELECT last_number FROM invoice_counters WHERE series = 'invoice' AND year = ?", [year]
    );
    const number = invoiceNumber(year, seq.last_number);
    const snap = snapshot(await customer(t, studentId));

    const res = await t.query(
      `INSERT INTO invoices
         (student_id, enrolment_id, instalment_no, instalment_of, number, currency,
          subtotal, total, paid_amount, status, issued_on, due_on, paid_on, locked_at, created_by,
          seller_name, seller_address, seller_tax_id, billing_name, billing_address, tax_note)
       VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)`,
      [studentId, enrolmentId, number, currency,
       amount(totalCents), amount(totalCents), amount(totalCents),
       receivedOn, receivedOn, receivedOn, createdBy,
       snap.seller_name, snap.seller_address, snap.seller_tax_id,
       snap.billing_name, snap.billing_address, snap.tax_note]
    );
    const invoiceId = res.insertId;

    for (let i = 0; i < lines.length; i += 1) {
      await t.query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount, sort_order)
         VALUES (?, ?, 1.00, ?, ?, ?)`,
        [invoiceId, lines[i].title, amount(cut[i]), amount(cut[i]), i]
      );
    }

    await t.query(
      `INSERT INTO payments (invoice_id, amount, currency, method, reference, received_on, recorded_by, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, amount(totalCents), currency, method, reference || null,
       receivedOn, createdBy, memo || null]
    );

    await note(t, "invoice.settled", "invoice", invoiceId, {
      number, amount: amount(totalCents), method, received_on: receivedOn,
    }, ip);

    return { invoiceId, number, total: totalCents };
  });
}

/**
 * Rows out of `payments`, with the dates already strings.
 *
 * mysql2 hands a DATE column back as a JS Date, and a template doing
 * String(thatDate).slice(0, 10) gets "Thu Oct 0" and renders "Invalid
 * Date" — which is what the payment history showed. Normalising here
 * means no view can get it wrong, rather than every view having to
 * remember.
 */
const datesOut = (rows) => (rows || []).map((r) => Object.assign({}, r, {
  received_on: day(r.received_on),
}));

/**
 * One invoice, whole: its lines, what has been paid against it, and
 * who it is for.
 *
 * The seller and buyer names are read from the INVOICE, not from the
 * school's settings and not from the students table. They are frozen
 * on it at the moment it is issued because people move and companies
 * rename themselves, and a reissued invoice that quietly says
 * something different from the one somebody was sent is the whole
 * problem the columns exist to avoid.
 */
async function invoice(id, { studentId = null } = {}) {
  if (!db.isEnabled()) return null;
  let head = await db.queryOne(
    `SELECT i.*, s.name AS student_name, s.email AS student_email,
            s.student_ref, c.title AS course_title, k.code AS batch_code
       FROM invoices i
       JOIN students s ON s.id = i.student_id
       LEFT JOIN enrolments e ON e.id = i.enrolment_id
       LEFT JOIN intakes k ON k.id = e.intake_id
       LEFT JOIN courses c ON c.id = k.course_id AND c.lang = 'en'
      WHERE i.id = ?${studentId === null ? "" : " AND i.student_id = ? AND i.status <> 'draft'"}`,
    studentId === null ? [id] : [id, studentId]
  );
  if (!head) return null;
  head = await require("./invoice-address-requests").effective(head);

  const [items, paid] = await Promise.all([
    db.query(
      `SELECT description, quantity, unit_price, amount
         FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id`,
      [id]
    ),
    db.query(
      `SELECT p.id, p.amount, p.method, p.reference, p.received_on, p.note,
              p.reverses_id,
              (SELECT r.id FROM payments r WHERE r.reverses_id = p.id) AS reversed_by
         FROM payments p WHERE p.invoice_id = ?
        ORDER BY p.received_on, p.id`,
      [id]
    ),
  ]);

  return Object.assign({}, head, {
    issued_on: day(head.issued_on),
    due_on: day(head.due_on),
    paid_on: day(head.paid_on),
    service_from: day(head.service_from),
    service_to: day(head.service_to),
    totalCents: cents(head.total),
    paidCents: cents(head.paid_amount),
    owedCents: Math.max(0, cents(head.total) - cents(head.paid_amount)),
    items: items.map((it) => Object.assign({}, it, { amountCents: cents(it.amount), unitPriceCents: cents(it.unit_price) })),
    payments: datesOut(paid).map((p) => Object.assign({}, p, { amountCents: cents(p.amount) })),
    ...stateOf(head),
  });
}

/** Payments against anything of this student's, newest first. */
async function paymentsForStudent(studentId) {
  if (!db.isEnabled()) return [];
  return datesOut(await db.query(
    `SELECT p.id, p.amount, p.currency, p.method, p.reference, p.received_on,
            p.note, p.created_at, p.reverses_id,
            (SELECT r.id FROM payments r WHERE r.reverses_id = p.id) AS reversed_by,
            i.number, i.instalment_no, i.instalment_of,
            i.enrolment_id, c.title AS course_title
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN enrolments e ON e.id = i.enrolment_id
       LEFT JOIN intakes k ON k.id = e.intake_id
       LEFT JOIN courses c ON c.id = k.course_id AND c.lang = 'en'
      WHERE i.student_id = ?
      ORDER BY p.received_on DESC, p.id DESC`,
    [studentId]
  ));
}

/**
 * Issue a drafted plan: numbers, dates, and the lock.
 *
 * The number comes from invoice_counters inside this transaction.
 * Deriving it from COUNT(*) or from the auto-increment id looks
 * equivalent and is not — deletes, gaps and two staff clicking at once
 * all break it, and a gapless sequence is exactly what a tax audit
 * checks.
 */
async function issuePlan(enrolmentId, { issuedOn = null } = {}) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");
  const on = issuedOn || todayStr();
  if (!isDate(on)) throw new BillingError("That is not a valid issue date.");

  return db.transaction(async (t) => {
    const drafts = await t.query(
      `SELECT id, instalment_no FROM invoices
        WHERE enrolment_id = ? AND status = 'draft'
        ORDER BY instalment_no, id`,
      [enrolmentId]
    );
    if (!drafts.length) throw new BillingError("There is nothing drafted to issue.");

    const year = Number(on.slice(0, 4));
    const owner = await t.queryOne(
      "SELECT student_id FROM invoices WHERE id = ?", [drafts[0].id]
    );
    const snap = snapshot(await customer(t, owner ? owner.student_id : 0));
    for (const d of drafts) {
      await t.query(
        `INSERT INTO invoice_counters (series, year, last_number) VALUES ('invoice', ?, 1)
         ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
        [year]
      );
      const row = await t.queryOne(
        "SELECT last_number FROM invoice_counters WHERE series = 'invoice' AND year = ?",
        [year]
      );
      const number = invoiceNumber(year, row.last_number);
      await t.query(
        `UPDATE invoices
            SET number = ?, status = 'issued', issued_on = ?, locked_at = NOW(),
                seller_name = ?, seller_address = ?, seller_tax_id = ?,
                billing_name = ?, billing_address = ?, tax_note = ?
          WHERE id = ? AND status = 'draft'`,
        [number, on, snap.seller_name, snap.seller_address, snap.seller_tax_id,
         snap.billing_name, snap.billing_address, snap.tax_note, d.id]
      );
    }
    await note(t, "plan.issued", "enrolment", enrolmentId, { invoices: drafts.length }, null);
    return { issued: drafts.length };
  });
}

/**
 * Record money that arrived.
 *
 * The invoice's paid_amount is recomputed from the sum of its payments
 * rather than incremented. Incrementing is correct exactly once and
 * wrong every time anything is retried, and this is the number the
 * student reads.
 */
async function recordPayment({
  invoiceId, amountCents, method, receivedOn, reference = null,
  note: memo = null, recordedBy = null, ip = null,
}) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");
  if (!Number.isInteger(amountCents) || amountCents === 0) {
    throw new BillingError("A payment needs an amount.");
  }
  if (amountCents < 0) {
    /* Refunds are a negative row and that is deliberate — but they are
       not recorded through this door, where a minus sign is far more
       likely to be a typo than an intention. */
    throw new BillingError("A payment cannot be negative. Record a refund as a credit note.");
  }
  if (!Object.prototype.hasOwnProperty.call(METHODS, method)) {
    throw new BillingError("That is not a payment method we take by hand.");
  }
  if (!isDate(receivedOn)) throw new BillingError("That is not a valid payment date.");
  if (receivedOn > todayStr()) throw new BillingError("A payment cannot have arrived in the future.");

  return db.transaction(async (t) => {
    const inv = await t.queryOne(
      "SELECT id, total, status, currency FROM invoices WHERE id = ? FOR UPDATE",
      [invoiceId]
    );
    if (!inv) throw new BillingError("That invoice does not exist.");
    if (inv.status === "draft") throw new BillingError("That invoice has not been issued yet.");
    if (inv.status === "void") throw new BillingError("That invoice has been cancelled.");

    await t.query(
      `INSERT INTO payments (invoice_id, amount, currency, method, reference, received_on, recorded_by, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, amount(amountCents), inv.currency, method, reference || null,
       receivedOn, recordedBy, memo || null]
    );

    const sum = await t.queryOne(
      "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?",
      [invoiceId]
    );
    const paid = cents(sum.paid);
    const total = cents(inv.total);
    const settled = paid >= total;

    await t.query(
      `UPDATE invoices
          SET paid_amount = ?, status = ?, paid_on = ?
        WHERE id = ?`,
      [amount(paid), settled ? "paid" : "part_paid", settled ? receivedOn : null, invoiceId]
    );

    await note(t, "payment.recorded", "invoice", invoiceId, {
      amount: amount(amountCents), method, received_on: receivedOn, reference: reference || null,
    }, ip);

    return { invoiceId, paid, total, owed: total - paid > 0 ? total - paid : 0, settled };
  });
}

/**
 * Put a payment back.
 *
 * Not an edit and not a delete: a second row carrying the negative of
 * the first and pointing at it. The invoice is then recomputed from
 * the sum of its payments and lands where it should, and the account
 * still reads as what happened — somebody took 500, somebody noticed,
 * it was put back.
 *
 * An UPDATE here would leave no trace that the row ever said
 * something else, and a DELETE no trace at all. Either is
 * indistinguishable from a member of staff removing a payment that
 * never arrived after pocketing the cash — and neither the school nor
 * the person accused of it could prove otherwise. This is the version
 * where the question has an answer.
 */
async function reversePayment({ paymentId, reason = null, recordedBy = null, ip = null }) {
  if (!db.isEnabled()) throw new BillingError("The database is not configured.");
  const why = String(reason || "").trim();
  /* Required. A reversal with no reason is the one row in the ledger
     that explains nothing, and it is the row somebody will be asked
     about. */
  if (why.length < 3) throw new BillingError("Say why this is being reversed.");
  if (why.length > 300) throw new BillingError("That reason is too long for the record.");

  return db.transaction(async (t) => {
    const was = await t.queryOne(
      `SELECT p.id, p.invoice_id, p.amount, p.currency, p.method, p.received_on,
              p.reverses_id, i.total, i.status
         FROM payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE p.id = ? FOR UPDATE`,
      [paymentId]
    );
    if (!was) throw new BillingError("That payment does not exist.");
    if (was.reverses_id) throw new BillingError("That row is itself a reversal.");

    const back = await t.queryOne(
      "SELECT id FROM payments WHERE reverses_id = ?", [paymentId]
    );
    if (back) throw new BillingError("That payment has already been reversed.");

    const undo = -cents(was.amount);
    await t.query(
      `INSERT INTO payments
         (invoice_id, reverses_id, amount, currency, method, reference, received_on, recorded_by, note)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      [was.invoice_id, paymentId, amount(undo), was.currency, was.method,
       todayStr(), recordedBy, why]
    );

    const sum = await t.queryOne(
      "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?",
      [was.invoice_id]
    );
    const paid = cents(sum.paid);
    const total = cents(was.total);
    const settled = paid >= total;
    await t.query(
      `UPDATE invoices SET paid_amount = ?, status = ?, paid_on = ? WHERE id = ?`,
      [amount(paid), settled ? "paid" : (paid > 0 ? "part_paid" : "issued"),
       settled ? day(was.received_on) : null, was.invoice_id]
    );

    await note(t, "payment.reversed", "invoice", was.invoice_id, {
      payment_id: paymentId, amount: amount(cents(was.amount)), reason: why,
    }, ip);

    return { invoiceId: was.invoice_id, reversed: cents(was.amount), paid, owed: total - paid };
  });
}

/**
 * What has been done to this student's money, newest first.
 *
 * Read straight out of audit_log. Nothing in this feature can change
 * a number without putting a line here in the same transaction, so
 * this list is not a summary of the history — it is the history.
 */
async function trailFor(studentId) {
  if (!db.isEnabled()) return [];
  return db.query(
    `SELECT a.id, a.action, a.entity_id, a.detail, a.created_at
       FROM audit_log a
      WHERE a.entity = 'invoice'
        AND a.entity_id IN (SELECT id FROM invoices WHERE student_id = ?)
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 200`,
    [studentId]
  );
}

/** What has actually been received against one enrolment, newest first. */
async function paymentsFor(enrolmentId) {
  if (!db.isEnabled()) return [];
  return datesOut(await db.query(
    `SELECT p.id, p.amount, p.currency, p.method, p.reference, p.received_on,
            p.note, p.created_at, p.reverses_id,
            (SELECT r.id FROM payments r WHERE r.reverses_id = p.id) AS reversed_by,
            i.number, i.instalment_no, i.instalment_of,
            a.name AS recorded_by_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       LEFT JOIN admin_users a ON a.id = p.recorded_by
      WHERE i.enrolment_id = ?
      ORDER BY p.received_on DESC, p.id DESC`,
    [enrolmentId]
  ));
}

/* ── The office's view ──────────────────────────────────────────────
 *
 * Everything below groups and sums in JavaScript rather than in SQL,
 * and that is on purpose. The student's page and the admin's table
 * must never disagree about what somebody owes, and the surest way to
 * guarantee that is for both to go through summarise() — one piece of
 * arithmetic, one set of rules about credit notes and voids, one test
 * suite over it. Two SQL aggregates written to match would match
 * until the day one of them was edited.
 *
 * The volume allows it. A language school has hundreds of enrolments,
 * not millions, and this is three rows each.
 */

/** Students with at least one enrolment, for the picker. */
async function enrolledStudents() {
  if (!db.isEnabled()) return [];
  return db.query(
    `SELECT s.id, s.name, s.email, s.student_ref, COUNT(e.id) AS enrolments
       FROM students s
       JOIN enrolments e ON e.student_id = s.id
      GROUP BY s.id
      ORDER BY s.name`
  );
}

/** One student's enrolments, with what the course costs today. */
async function enrolmentsFor(studentId) {
  if (!db.isEnabled()) return [];
  return db.query(
    `SELECT e.id, e.status, e.enrolled_on,
            k.code AS batch_code, k.starts_on,
            c.title AS course_title, c.price_eur, c.discount_eur,
            (SELECT COUNT(*) FROM invoices i
              WHERE i.enrolment_id = e.id AND i.status <> 'void') AS invoices
       FROM enrolments e
       LEFT JOIN intakes k ON k.id = e.intake_id
       LEFT JOIN courses c ON c.id = k.course_id AND c.lang = 'en'
      WHERE e.student_id = ?
      ORDER BY e.enrolled_on DESC, e.id DESC`,
    [studentId]
  );
}

/**
 * Every enrolment that has been billed, with where it stands.
 *
 * Enrolments with no invoices at all are included deliberately: a
 * course nobody has billed for is the single most useful row on this
 * page, and a query that only returned existing invoices would hide
 * exactly the students the office needs to chase.
 */
async function overview({ on = null } = {}) {
  if (!db.isEnabled()) return { rows: [], totals: emptyTotals() };
  const now = on || todayStr();

  const [bills, enrols] = await Promise.all([
    db.query(
      `SELECT ${INVOICE_COLS}, i.student_id, s.name AS student_name, s.student_ref
         ${INVOICE_FROM}
         JOIN students s ON s.id = i.student_id
        WHERE i.enrolment_id IS NOT NULL
        ORDER BY i.due_on IS NULL, i.due_on, i.id`
    ),
    db.query(
      `SELECT e.id, e.student_id, s.name AS student_name, s.student_ref,
              k.code AS batch_code, c.title AS course_title
         FROM enrolments e
         JOIN students s ON s.id = e.student_id
         LEFT JOIN intakes k ON k.id = e.intake_id
         LEFT JOIN courses c ON c.id = k.course_id AND c.lang = 'en'
        WHERE e.status IN ('active', 'completed')`
    ),
  ]);

  const byEnrolment = new Map();
  for (const e of enrols) {
    byEnrolment.set(String(e.id), {
      enrolmentId: e.id,
      studentId: e.student_id,
      student: e.student_name,
      ref: e.student_ref,
      label: e.course_title || "Course",
      batch: e.batch_code || null,
      currency: "EUR",
      rows: [],
    });
  }
  for (const b of bills) {
    const key = String(b.enrolment_id);
    if (!byEnrolment.has(key)) continue; // withdrawn, but the invoice stands
    const g = byEnrolment.get(key);
    g.currency = b.currency || g.currency;
    g.rows.push(b);
  }

  const rows = [...byEnrolment.values()]
    .map((g) => Object.assign(g, summarise(g.rows, now)))
    .sort((a, b) => {
      const rank = { overdue: 0, draft: 1, part_paid: 2, pending: 3, none: 4, paid: 5 };
      if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      return String(a.student).localeCompare(String(b.student));
    });

  return { rows, totals: tally(rows, now) };
}

const emptyTotals = () => ({ outstanding: 0, overdue: 0, dueSoon: 0, paidThisMonth: 0, count: 0 });

function tally(rows, now) {
  const month = now.slice(0, 7);
  const t = emptyTotals();
  for (const r of rows) {
    t.count += 1;
    t.outstanding += r.owed;
    t.overdue += r.overdueAmount;
    if (r.next && r.next.state === "due") t.dueSoon += r.next.owed;
    /* Counted from the invoices that were settled this month rather
       than from the payments table, so the figure uses the same rules
       about credit notes as everything else on the page. */
    for (const p of r.parts) {
      if (p.state === "paid" && day(p.paid_on) && day(p.paid_on).slice(0, 7) === month) {
        t.paidThisMonth += p.paid;
      }
    }
  }
  return t;
}

/** The filters on the admin table, as predicates rather than SQL. */
const FILTERS = {
  all: () => true,
  drafted: (r) => r.state === "draft",
  overdue: (r) => r.state === "overdue",
  part_paid: (r) => r.state === "part_paid",
  pending: (r) => r.state === "pending",
  paid: (r) => r.state === "paid",
  unbilled: (r) => r.state === "none",
};


/** The advertised payable fee, in cents. A discount is a replacement price. */
function enrolmentFee(course) {
  if (course.price_eur === null || course.price_eur === undefined || course.price_eur === '') return null;
  if (!Number.isFinite(Number(course.price_eur))) throw new BillingError('The course fee is invalid.');
  const price = cents(course.price_eur), discount = course.discount_eur == null || course.discount_eur === '' ? null : cents(course.discount_eur);
  if (price < 0) throw new BillingError('The course fee cannot be negative.');
  return discount !== null && discount >= 0 && discount < price ? discount : price;
}

/** Issued in the enrolment's own transaction: both membership and invoice succeed together. */
async function issueAtEnrolment(t, enrolmentId, { on = todayStr() } = {}) {
  if (!isDate(on)) throw new BillingError('That is not a valid issue date.');
  const enrol = await t.queryOne(
    `SELECT e.id, e.student_id, c.title AS course_title, c.price_eur, c.discount_eur
       FROM enrolments e JOIN intakes k ON k.id=e.intake_id
       JOIN courses c ON c.id=k.course_id AND c.lang='en'
      WHERE e.id=? FOR UPDATE`, [enrolmentId]);
  if (!enrol) throw new BillingError('The enrolled course could not be found.');
  const existing = await t.queryOne("SELECT id FROM invoices WHERE enrolment_id=? AND status <> 'void' LIMIT 1",[enrolmentId]);
  if (existing) return { status:'already_billed',invoiceId:existing.id };
  const fee=enrolmentFee(enrol);
  if (fee === null || fee === 0) return {status:fee===null?'fee_unset':'free',fee};
  const snap=snapshot(await customer(t,enrol.student_id)),year=Number(on.slice(0,4));
  await t.query(`INSERT INTO invoice_counters (series,year,last_number) VALUES ('invoice',?,1)
    ON DUPLICATE KEY UPDATE last_number=last_number+1`,[year]);
  const counter=await t.queryOne("SELECT last_number FROM invoice_counters WHERE series='invoice' AND year=?",[year]);
  const number=invoiceNumber(year,counter.last_number);
  const invoice=await t.query(`INSERT INTO invoices
    (student_id,enrolment_id,instalment_no,instalment_of,number,currency,subtotal,total,paid_amount,
     status,issued_on,due_on,locked_at,seller_name,seller_address,seller_tax_id,billing_name,billing_address,tax_note)
    VALUES (?,?,1,1,?,'EUR',?,?,0,'issued',?,?,NOW(),?,?,?,?,?,?)`,
    [enrol.student_id,enrolmentId,number,amount(fee),amount(fee),on,on,snap.seller_name,snap.seller_address,
     snap.seller_tax_id,snap.billing_name,snap.billing_address,snap.tax_note]);
  await t.query(`INSERT INTO invoice_items (invoice_id,description,quantity,unit_price,amount,sort_order)
    VALUES (?,?,1.00,?,?,0)`,[invoice.insertId,enrol.course_title||'Course fee',amount(fee),amount(fee)]);
  await note(t,'enrolment.invoice_issued','enrolment',enrolmentId,{invoiceId:invoice.insertId,number,fee},null);
  return {status:'issued',invoiceId:invoice.insertId,number,fee};
}

/** Existing memberships without invoices remain visible, without inventing invoice numbers/debts. */
async function pendingEnrolments(studentId, plans=[]) {
  // Combined legacy plans have no per-enrolment association; do not bill them twice.
  if(plans.some(p=>p.combined)) return [];
  return (await enrolmentsFor(studentId)).filter(e=>['active','completed'].includes(e.status)&&Number(e.invoices)===0)
    .map(e=>({...e,fee:enrolmentFee(e)}));
}

module.exports = {
  enrolmentFee, issueAtEnrolment, pendingEnrolments,
  cents, amount, day, todayStr, plus,
  enrolledStudents, enrolmentsFor, overview, tally, FILTERS,
  stateOf, summarise, forStudent, alertFor,
  split, monthly,
  draftPlan, draftCombined, issuePlan, issueForStudent, discardDrafts,
  recordPayment, reversePayment, settle, invoice,
  paymentsFor, paymentsForStudent, trailFor, share,
  BillingError, isDate,
  METHODS, ALL_METHODS, STATE_LABEL, SUMMARY_STATE, SOON_DAYS,
  INVOICE_COLS, INVOICE_FROM,
};
