// ─────────────────────────────────────────────────────────────────────
//  Money.
//
//  This suite matters more than its size suggests. Everything it
//  covers is a number a student reads and a number the school's books
//  depend on, and the failures are all quiet ones: a cent lost in a
//  split, a status that says Paid because a float came back as
//  499.99999999999994, an overdue date that moves when the server
//  changes timezone. Nobody reports those. They are found months later
//  by somebody reconciling a bank statement.
//
//  There is no database here. Every write is run against a fake that
//  records the SQL, which is enough to hold the two things worth
//  holding: that the arithmetic is exact, and that nothing takes a
//  shortcut around the ledger.
// ─────────────────────────────────────────────────────────────────────
"use strict";

process.env.TZ = "UTC";

const db = require("../lib/db");
const b = require("../lib/billing");

let passed = 0;
let failed = 0;
const ok = (label, cond) => {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.log(`  ✗ ${label}`);
  }
};
const section = (t) => console.log(`\n${t}`);

/** Runs fn and gives back the BillingError message, or null. */
async function refuses(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e && e.name === "BillingError" ? e.message : `THREW ${e.message}`;
  }
}

(async () => {
  // ── cents ─────────────────────────────────────────────────────────
  section("Money, exactly");

  ok("a plain amount", b.cents("1500.00") === 150000);
  ok("...and one that a float would spoil", b.cents("0.07") === 7);
  ok("...and the largest the column can hold", b.cents("99999999.99") === 9999999999);
  ok("no amount at all is zero, not NaN", b.cents(null) === 0 && b.cents("") === 0);
  ok("a negative is negative", b.cents("-12.34") === -1234);

  /* The round trip is the whole promise: what comes out of the
     database and goes back into it has to be the same number. */
  const nasty = ["0.01", "0.07", "0.10", "1.05", "19.99", "1500.00", "99999999.99"];
  ok("every amount survives the round trip",
     nasty.every((v) => b.amount(b.cents(v)) === v));

  /* The classic. Adding these as Numbers gives 0.30000000000000004,
     which is what puts 0.30000000000000004 on an invoice. */
  ok("a tenth plus two tenths is exactly three tenths",
     b.amount(b.cents("0.10") + b.cents("0.20")) === "0.30");

  // ── splitting a fee ───────────────────────────────────────────────
  section("Splitting a fee");

  for (const [total, n] of [[150000, 3], [100000, 3], [100000, 7], [1, 3], [99999, 6]]) {
    const parts = b.split(total, n);
    ok(`${b.amount(total)} over ${n} adds back up`,
       parts.length === n && parts.reduce((x, y) => x + y, 0) === total);
  }
  /* On the first, not the last. A student reading a plan notices an
     odd number at the bottom; the school would rather take the cent
     early than explain it. */
  ok("the odd cent goes on the first instalment", b.split(100000, 3)[0] === 33334);
  ok("...and nowhere else", b.split(100000, 3).slice(1).every((p) => p === 33333));

  // ── due dates ─────────────────────────────────────────────────────
  section("Due dates");

  ok("monthly is monthly", b.monthly("2026-03-01", 3).join(",") === "2026-03-01,2026-04-01,2026-05-01");
  /* The 31st of a month with 30 days. Plain date arithmetic rolls it
     into the next month, which silently moves an instalment out of the
     month the student was promised. */
  const ends = b.monthly("2026-01-31", 4);
  ok("the 31st becomes the last day of a short month",
     ends.join(",") === "2026-01-31,2026-02-28,2026-03-31,2026-04-30");
  ok("...and never slips into the following month",
     ends.every((d, i) => Number(d.slice(5, 7)) === i + 1));

  // ── where an invoice stands ───────────────────────────────────────
  section("Where an invoice stands");

  const on = "2026-10-02";
  const inv = (total, paid, due, extra) =>
    Object.assign({ total, paid_amount: paid, due_on: due, status: "issued", kind: "invoice" }, extra || {});

  ok("settled is paid", b.stateOf(inv("500.00", "500.00", "2026-09-01"), on).state === "paid");
  ok("...even a cent over", b.stateOf(inv("500.00", "500.01", "2026-09-01"), on).state === "paid");
  ok("unpaid and past is overdue", b.stateOf(inv("500.00", "0.00", "2026-09-01"), on).state === "overdue");
  ok("near is due soon", b.stateOf(inv("500.00", "0.00", "2026-10-10"), on).state === "due");
  ok("far off is upcoming", b.stateOf(inv("500.00", "0.00", "2026-12-01"), on).state === "upcoming");
  ok("due today is not yet overdue", b.stateOf(inv("500.00", "0.00", on), on).state === "due");

  /* Part paid AND overdue is one invoice and two facts. Collapsing
     them into one loses the one the student needs: that 200 of the 500
     is still owed and was owed last month. */
  const half = b.stateOf(inv("500.00", "300.00", "2026-09-01"), on);
  ok("part paid and late is still late", half.state === "overdue");
  ok("...and says so is part paid", half.partial === true);
  ok("...and owes the difference", half.owed === 20000);

  ok("a credit note is not a debt", b.stateOf(inv("-500.00", "0.00", null, { kind: "storno" }), on).owed === 0);
  ok("a cancelled invoice is not a debt",
     b.stateOf(inv("500.00", "0.00", "2026-01-01", { status: "void" }), on).owed === 0);
  ok("a draft is a draft", b.stateOf(inv("500.00", "0.00", null, { status: "draft" }), on).state === "draft");

  /* No timezone anywhere. The date columns are compared as strings, so
     a server in Berlin and a database in UTC cannot disagree about
     whether something is due today. */
  ok("a Date from the driver reads the same as a string",
     b.day(new Date(2026, 9, 2)) === "2026-10-02");

  // ── a whole plan ──────────────────────────────────────────────────
  section("A whole plan");

  const plan = b.summarise([
    inv("500.00", "500.00", "2026-09-01", { instalment_no: 1, instalment_of: 3 }),
    inv("500.00", "0.00", "2026-10-10", { instalment_no: 2, instalment_of: 3 }),
    inv("500.00", "0.00", "2026-11-10", { instalment_no: 3, instalment_of: 3 }),
  ], on);
  ok("the total is the sum of the parts", plan.total === 150000);
  ok("...and so is what has been paid", plan.paid === 50000);
  ok("...and what is left", plan.owed === 100000);
  ok("one paid of three is partially paid", plan.state === "part_paid");
  ok("the next one due is the next one due", plan.next && plan.next.instalment_no === 2);
  ok("three invoices is a plan", plan.planned === true);

  const oneOff = b.summarise([inv("1500.00", "1500.00", "2026-09-01")], on);
  ok("paid in full says so", oneOff.state === "paid");
  ok("...and a single invoice is not a plan", oneOff.planned === false);
  ok("...and nothing is next", oneOff.next === null);

  const late = b.summarise([
    inv("500.00", "500.00", "2026-08-01"),
    inv("500.00", "0.00", "2026-09-01"),
  ], on);
  ok("one missed instalment makes the plan overdue", late.state === "overdue");
  ok("...and the amount is the missed one, not the total", late.overdueAmount === 50000);

  /* A Storno carries the negative of what it cancels, so adding it is
     the whole of the correction. Treating it as another debt would
     have the student owing twice for a bill that was withdrawn. */
  const credited = b.summarise([
    inv("500.00", "500.00", "2026-08-01"),
    inv("-500.00", "-500.00", null, { kind: "storno" }),
  ], on);
  ok("a credit note cancels out", credited.total === 0 && credited.owed === 0);

  const voided = b.summarise([
    inv("500.00", "0.00", "2026-01-01", { status: "void" }),
    inv("500.00", "500.00", "2026-02-01"),
  ], on);
  ok("a cancelled invoice is not counted", voided.total === 50000 && voided.state === "paid");

  // ── what the student is told ──────────────────────────────────────
  section("What the student is told");

  const realEnabled = db.isEnabled;
  const realQuery = db.query;
  const realQueryOne = db.queryOne;
  const realTx = db.transaction;
  db.isEnabled = () => true;

  const rows = (list) => { db.query = async () => list; };

  /* Who is reading decides whether drafts are in it.
   *
   * One query served both and the office got the student's answer: a
   * plan drafted and never issued was invisible on the page that was
   * supposed to issue it, so the Drafted card could not render, the
   * setup form came back as though nothing existed, and drafting
   * again was refused by a guard pointing at invoices nobody could
   * see. The mock below returns the same rows either way, so the
   * check has to be on the SQL itself. */
  const asked = [];
  db.query = async (q) => { asked.push(q.replace(/\s+/g, " ")); return []; };
  await b.forStudent(1, on);
  ok("the student is never shown a draft", asked.every((q) => /status <> 'draft'/.test(q)));
  asked.length = 0;
  await b.forStudent(1, on, { drafts: true });
  ok("...and the office always is", asked.every((q) => !/status <> 'draft'/.test(q)));

  rows([]);
  ok("nothing billed, nothing said", (await b.alertFor(1, on)) === null);

  rows([{ ...inv("500.00", "500.00", "2026-09-01"), enrolment_id: 7, course_title: "B1", currency: "EUR" }]);
  ok("a student who has paid is not nagged", (await b.alertFor(1, on)) === null);

  rows([{ ...inv("500.00", "0.00", "2026-12-01"), enrolment_id: 7, course_title: "B1", currency: "EUR" }]);
  ok("nor one whose next payment is months away", (await b.alertFor(1, on)) === null);

  rows([{ ...inv("500.00", "0.00", "2026-10-10"), enrolment_id: 7, course_title: "B1", currency: "EUR" }]);
  const soon = await b.alertFor(1, on);
  ok("a payment due soon is a reminder", soon && soon.level === "due" && soon.amount === 50000);

  rows([
    { ...inv("500.00", "0.00", "2026-09-01"), enrolment_id: 7, course_title: "B1", currency: "EUR" },
    { ...inv("500.00", "0.00", "2026-10-10"), enrolment_id: 7, course_title: "B1", currency: "EUR" },
  ]);
  const bad = await b.alertFor(1, on);
  ok("an overdue one outranks it", bad && bad.level === "overdue");
  ok("...and names the amount actually missed", bad.amount === 50000);

  /* Two courses are two accounts. Paying for one does not settle the
     other, and the page must not add them into a single figure. */
  rows([
    { ...inv("500.00", "500.00", "2026-08-01"), enrolment_id: 7, course_title: "B1", currency: "EUR" },
    { ...inv("800.00", "0.00", "2026-11-01"), enrolment_id: 9, course_title: "B2", currency: "EUR" },
  ]);
  const both = await b.forStudent(1, on);
  ok("two enrolments are two plans", both.length === 2);
  ok("...and their money stays apart",
     both[0].owed === 0 && both[1].owed === 80000);

  // ── writing ───────────────────────────────────────────────────────
  section("Writing money down");

  const sql = [];
  db.transaction = async (fn) =>
    fn({
      query: async (q, p) => { sql.push([q.replace(/\s+/g, " ").trim(), p]); return { insertId: 1 }; },
      queryOne: async (q, p) => {
        sql.push([q.replace(/\s+/g, " ").trim(), p]);
        if (/FROM invoices/.test(q)) return { id: 1, total: "500.00", status: "issued", currency: "EUR" };
        if (/SUM\(amount\)/.test(q)) return { paid: "300.00" };
        if (/last_number/.test(q)) return { last_number: 7 };
        return null;
      },
    });

  ok("a payment cannot be negative",
     /cannot be negative/.test(await refuses(() =>
       b.recordPayment({ invoiceId: 1, amountCents: -100, method: "cash", receivedOn: "2026-10-01" }))));
  ok("...nor zero",
     Boolean(await refuses(() =>
       b.recordPayment({ invoiceId: 1, amountCents: 0, method: "cash", receivedOn: "2026-10-01" }))));
  ok("...nor by a method we do not take by hand",
     Boolean(await refuses(() =>
       b.recordPayment({ invoiceId: 1, amountCents: 100, method: "bitcoin", receivedOn: "2026-10-01" }))));
  /* Card is in the column so an online provider can write it one day.
     It is not something a member of staff types in. */
  ok("...including card, which only a provider may write",
     Boolean(await refuses(() =>
       b.recordPayment({ invoiceId: 1, amountCents: 100, method: "card", receivedOn: "2026-10-01" }))));
  ok("...nor on a date that has not happened",
     /future/.test(await refuses(() =>
       b.recordPayment({ invoiceId: 1, amountCents: 100, method: "cash", receivedOn: "2099-01-01" }))));
  ok("...nor with no date at all",
     Boolean(await refuses(() =>
       b.recordPayment({ invoiceId: 1, amountCents: 100, method: "cash", receivedOn: "soon" }))));

  sql.length = 0;
  const got = await b.recordPayment({
    invoiceId: 1, amountCents: 30000, method: "bank_transfer", receivedOn: "2026-10-01", recordedBy: 3,
  });
  ok("a good one is written down", sql.some(([q]) => /INSERT INTO payments/.test(q)));
  ok("...and leaves the invoice part paid", got.settled === false && got.owed === 20000);
  /* Recomputed from the sum of the payments, not added to a running
     total. Incrementing is right exactly once and wrong every time
     anything is retried — and this is the number the student reads. */
  ok("the balance is recomputed from the payments, not incremented",
     sql.some(([q]) => /SUM\(amount\)[\s\S]*FROM payments/.test(q)));
  ok("...and nothing adds to paid_amount in place",
     !sql.some(([q]) => /paid_amount\s*=\s*paid_amount/.test(q)));
  ok("the row is locked while it is read",
     sql.some(([q]) => /FROM invoices WHERE id = \? FOR UPDATE/.test(q)));

  /* An amount edited in place after issue would be an invoice that no
     longer matches the one the student was sent. Corrections are
     credit notes; there is no update path and this proves it. */
  ok("there is no way to edit an issued amount",
     typeof b.update === "undefined" && typeof b.remove === "undefined");

  // ── drafting a plan ───────────────────────────────────────────────
  section("Drafting a plan");

  db.queryOne = async (q) => {
    if (/FROM enrolments/.test(q)) return { id: 5, student_id: 2, course_title: "B1", batch_code: "B1-A" };
    if (/COUNT\(\*\) AS n FROM invoices/.test(q)) return { n: 0 };
    return null;
  };

  ok("a plan needs instalments", Boolean(await refuses(() => b.draftPlan(5, { parts: [] }))));
  ok("...each with an amount",
     /more than zero/.test(await refuses(() =>
       b.draftPlan(5, { parts: [{ amount: 0, due_on: "2026-11-01" }] }))));
  ok("...each with a due date",
     /due date/.test(await refuses(() =>
       b.draftPlan(5, { parts: [{ amount: 100, due_on: null }] }))));

  sql.length = 0;
  const drafted = await b.draftPlan(5, {
    parts: b.split(150000, 3).map((a, i) => ({ amount: a, due_on: b.monthly("2026-11-01", 3)[i] })),
    createdBy: 3,
  });
  ok("three instalments make three invoices", drafted.of === 3);
  /* 'draft' is a literal in the statement, not a bound parameter --
     the status an invoice is born with is not the caller's to choose. */
  ok("...all drafts", sql.filter(([q]) => /INSERT INTO invoices/.test(q)).length === 3 &&
     sql.filter(([q]) => /INSERT INTO invoices/.test(q) && /'draft'/.test(q)).length === 3);
  ok("...each with a line saying which one it is",
     sql.filter(([q]) => /INSERT INTO invoice_items/.test(q)).length === 3);

  /* Billing a student twice for one course is the worst thing this
     module could do, and the office would have no way of telling which
     of the two was the real one. */
  db.queryOne = async (q) => {
    if (/FROM enrolments/.test(q)) return { id: 5, student_id: 2, course_title: "B1" };
    if (/COUNT\(\*\) AS n FROM invoices/.test(q)) return { n: 3 };
    return null;
  };
  ok("an enrolment cannot be billed twice",
     Boolean(await refuses(() =>
       b.draftPlan(5, { parts: [{ amount: 100, due_on: "2026-11-01" }] }))));

  /* And it has to say WHICH. "Already has invoices" sent somebody
     hunting for invoices that were drafts, on a page that was not
     showing drafts, with no way out of either -- which is the bug
     that produced this test. */
  ok("...saying so, when they are drafts nobody has issued",
     /drafted/.test(await refuses(() =>
       b.draftPlan(5, { parts: [{ amount: 100, due_on: "2026-11-01" }] }))));

  db.queryOne = async (q) => {
    if (/FROM enrolments/.test(q)) return { id: 5, student_id: 2, course_title: "B1" };
    if (/status = 'draft'/.test(q)) return { n: 0 };
    if (/COUNT\(\*\) AS n FROM invoices/.test(q)) return { n: 3 };
    return null;
  };
  ok("...and differently when they have actually been issued",
     /credit note/.test(await refuses(() =>
       b.draftPlan(5, { parts: [{ amount: 100, due_on: "2026-11-01" }] }))));

  // ── putting a payment back ────────────────────────────────────────
  section("Reversing a payment");

  /* The whole point: nothing is edited and nothing is deleted. An
     UPDATE leaves no trace the row ever said something else and a
     DELETE no trace at all, and either is indistinguishable from a
     member of staff removing a payment that never arrived after
     pocketing the cash — as bad for an honest person accused of it as
     for a dishonest one doing it. */
  let fake = { id: 11, invoice_id: 1, amount: "500.00", currency: "EUR",
               method: "cash", received_on: "2026-09-01", reverses_id: null,
               total: "750.00", status: "part_paid" };
  let reversal = null;
  db.transaction = async (fn) =>
    fn({
      query: async (q, p) => { sql.push([q.replace(/\s+/g, " ").trim(), p]); return { insertId: 99 }; },
      queryOne: async (q, p) => {
        sql.push([q.replace(/\s+/g, " ").trim(), p]);
        if (/FROM payments p JOIN invoices/.test(q)) return fake;
        if (/WHERE reverses_id = \?/.test(q)) return reversal;
        if (/SUM\(amount\)/.test(q)) return { paid: "0.00" };
        return null;
      },
    });

  ok("a reversal needs a reason",
     /why this is being reversed/.test(await refuses(() =>
       b.reversePayment({ paymentId: 11 }))));
  ok("...a real one",
     Boolean(await refuses(() => b.reversePayment({ paymentId: 11, reason: "x" }))));

  sql.length = 0;
  const undone = await b.reversePayment({ paymentId: 11, reason: "Entered against the wrong student" });
  ok("it writes a new row rather than touching the old one",
     sql.some(([q]) => /INSERT INTO payments/.test(q)));
  ok("...carrying the negative of it",
     sql.some(([q, p]) => /INSERT INTO payments/.test(q) && p.includes("-500.00")));
  ok("...pointing at what it reverses",
     sql.some(([q, p]) => /INSERT INTO payments/.test(q) && /reverses_id/.test(q) && p[1] === 11));
  ok("...and keeping the reason with it",
     sql.some(([q, p]) => /INSERT INTO payments/.test(q) &&
       p.includes("Entered against the wrong student")));
  ok("nothing updates or deletes the original",
     !sql.some(([q]) => /UPDATE payments/.test(q) || /DELETE/.test(q)));
  ok("the invoice goes back to being owed", undone.paid === 0 && undone.owed === 75000);
  /* audit_log has been in the schema from the start with a comment
     saying money gets disputed and "the system says so" is not an
     answer. Nothing wrote to it until now. */
  ok("and a line goes in the audit log, in the same transaction",
     sql.some(([q, p]) => /INSERT INTO audit_log/.test(q) && p[0] === "payment.reversed"));

  /* Twice would take 1,000 off a 500 payment, which is the hole the
     whole arrangement exists to close — and it is exactly what a
     double-clicked button does. The database refuses it too, with a
     UNIQUE on reverses_id; this is the readable half. */
  reversal = { id: 12 };
  ok("a payment cannot be reversed twice",
     /already been reversed/.test(await refuses(() =>
       b.reversePayment({ paymentId: 11, reason: "again" }))));

  reversal = null;
  fake = { ...fake, reverses_id: 11 };
  ok("...and a reversal cannot itself be reversed",
     /itself a reversal/.test(await refuses(() =>
       b.reversePayment({ paymentId: 12, reason: "undo the undo" }))));
  fake = { ...fake, reverses_id: null };

  /* Recording one logs too, or the trail has holes exactly where the
     money came in. */
  sql.length = 0;
  db.transaction = async (fn) =>
    fn({
      query: async (q, p) => { sql.push([q.replace(/\s+/g, " ").trim(), p]); return { insertId: 1 }; },
      queryOne: async (q) => {
        if (/FROM invoices/.test(q)) return { id: 1, total: "500.00", status: "issued", currency: "EUR" };
        if (/SUM\(amount\)/.test(q)) return { paid: "500.00" };
        /* The sections below use this same stub, and settle() claims
           an invoice number from the counter. Without this they get
           null and the suite dies rather than failing. */
        if (/last_number/.test(q)) return { last_number: 7 };
        return null;
      },
    });
  await b.recordPayment({ invoiceId: 1, amountCents: 50000, method: "cash", receivedOn: "2026-10-01" });
  ok("recording a payment is logged as well",
     sql.some(([q, p]) => /INSERT INTO audit_log/.test(q) && p[0] === "payment.recorded"));

  // ── paid before it was ever billed ────────────────────────────────
  section("Already paid in full");

  /* The shortcut has to take the SAME route through the ledger as
     everything else, or it becomes the one kind of payment that
     behaves differently -- and the one that is wrong when somebody
     reconciles a bank statement. */
  db.queryOne = async (q) => {
    if (/COUNT\(\*\) AS n FROM invoices/.test(q)) return { n: 0 };
    return null;
  };

  ok("a fee of nothing is refused",
     /more than zero/.test(await refuses(() =>
       b.settle(1, { totalCents: 0, method: "cash", receivedOn: "2026-10-01" }))));
  ok("...and a method we do not take by hand",
     Boolean(await refuses(() =>
       b.settle(1, { totalCents: 100, method: "card", receivedOn: "2026-10-01" }))));
  ok("...and a date that has not happened",
     /future/.test(await refuses(() =>
       b.settle(1, { totalCents: 100, method: "cash", receivedOn: "2099-01-01" }))));

  sql.length = 0;
  const settled = await b.settle(1, {
    enrolmentId: 7, totalCents: 75000, method: "cash", receivedOn: "2026-10-01",
  });
  ok("it raises an invoice", sql.some(([q]) => /INSERT INTO invoices/.test(q)));
  /* LN-2026-000007: the series and the width are settings, so the
     test reads them rather than hard-coding a shape that a school
     with its own convention would fail. */
  const siteCfg = require("../lib/site");
  const numberShape = new RegExp(
    "^" + (siteCfg.invoice.prefix ? siteCfg.invoice.prefix + "-" : "") + "\\d{4}-\\d{" + siteCfg.invoice.digits + "}$");
  ok("...with a number from the counter, claimed in the same transaction",
     sql.some(([q]) => /INSERT INTO invoice_counters/.test(q)) &&
     numberShape.test(settled.number));

  /* The issuer and the customer are frozen onto the invoice. The
     columns have been in the schema from the start and nothing ever
     wrote to them, so every invoice was rebuilt from whatever the
     settings and the students table happened to say today -- and an
     issued invoice that quietly changes when somebody moves house is
     the problem they exist to prevent. */
  ok("...and the issuer and customer are frozen onto it",
     sql.some(([q]) => /INSERT INTO invoices/.test(q) &&
       /seller_name/.test(q) && /billing_name/.test(q)));
  ok("...issued and locked rather than left as a draft",
     sql.some(([q]) => /INSERT INTO invoices/.test(q) && /'paid'/.test(q) && /locked_at/.test(q)));
  /* No "mark as paid" flag anywhere. The invoice is settled because a
     payment row says so, which is the same thing that will settle it
     when a provider's webhook writes one. */
  ok("...and settled by a real payment row, not by a flag",
     sql.some(([q]) => /INSERT INTO payments/.test(q)));
  ok("...with a line saying what it was for",
     sql.some(([q]) => /INSERT INTO invoice_items/.test(q)));

  /* Half of this is an issued invoice for money the school has
     already taken, which is worse than not having recorded it. */
  ok("all of it happens in one transaction", sql.every(([q]) => !/^BEGIN/i.test(q)));

  sql.length = 0;
  const two = await b.settle(1, {
    courses: [{ title: "Fast Track", fee: 75000 }, { title: "Regular B1", fee: 125000 }],
    totalCents: 200000, method: "bank_transfer", receivedOn: "2026-10-01",
  });
  ok("two courses settled together get a line each",
     sql.filter(([q]) => /INSERT INTO invoice_items/.test(q)).length === 2);
  ok("...split in proportion to what each costs",
     sql.filter(([q]) => /INSERT INTO invoice_items/.test(q))
        .map(([, p]) => p[2]).join("|") === "750.00|1250.00");
  ok("...and the lines add up to the invoice", two.total === 200000);

  db.queryOne = async (q) => {
    if (/COUNT\(\*\) AS n FROM invoices/.test(q)) return { n: 1 };
    return null;
  };
  ok("something already billed cannot be settled this way",
     /already billed/.test(await refuses(() =>
       b.settle(1, { totalCents: 100, method: "cash", receivedOn: "2026-10-01" }))));

  db.isEnabled = realEnabled;
  db.query = realQuery;
  db.queryOne = realQueryOne;
  db.transaction = realTx;

  /* ── Whose invoice it is ──────────────────────────────────────────
   *
   * Every other read in the portal takes the student id from the
   * session and has no parameter to tamper with. This one has an id
   * in the address bar, which makes it the only place in the portal
   * where authorisation is a decision rather than a consequence.
   *
   * Read from the route's source, because there is no database here
   * and the thing worth holding is that the check is in the handler
   * at all. If somebody refactors it away the failure is silent and
   * what leaks is every student's invoices.
   */
  section("A student may only open their own invoice");
  {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "routes", "student.js"), "utf8");
    const at = src.indexOf('router.get("/payments/invoice/:id"');
    const start = src.indexOf("async function renderInvoice");
    const handler = start === -1 ? "" : src.slice(start, at + 220);

    ok("the route exists", at !== -1);
    ok("...behind the student gate", /requireStudent/.test(handler));
    /* me.id comes from the signed cookie; req.params.id does not. The
       comparison has to be between those two and nothing else. */
    ok("...and compares the invoice's owner with the signed-in student",
       /bill\.student_id/.test(handler) && /me\.id/.test(handler));
    ok("...answering the same way for somebody else's and for no such invoice",
       /if \(!bill \|\| String\(bill\.student_id\) !== String\(me\.id\)\) return res\.sendStatus\(404\)/.test(handler));
    /* A draft is the office still deciding: no number, possibly
       discarded tomorrow, and not a bill the student has been sent. */
    ok("...and refusing a draft nobody has issued",
       /bill\.status === "draft"/.test(handler) && /return res\.sendStatus\(404\)/.test(handler));
    /* The schedule shown beside it must be read for the signed-in
       student, not for the invoice's owner -- otherwise a wrong id
       drags somebody else's plan onto the page even when the invoice
       itself is refused. */
    ok("...and reads the schedule for the signed-in student",
       /forStudent\(me\.id\)/.test(handler));
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
})().catch((e) => {
  console.error("\n  threw:", e.stack, "\n");
  process.exit(1);
});
