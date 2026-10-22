// What a class hears when a lesson moves or is called off.
//
// The reason this exists rather than a note in the group chat: a batch
// has students in several time zones, a chat message is read by whoever
// happens to be looking, and somebody who misses it travels to a class
// that is not running. An email goes to everybody, says the old time and
// the new one, and can be found again in a week.
//
// Three rules the wording follows.
//
//   Say the OLD time as well as the new one. "Thursday's class is now
//   Friday" is what somebody who wrote the old time down needs to hear;
//   "there is a class on Friday" leaves them still expecting Thursday.
//
//   Print every time in the STUDENT's batch timezone. The classes run
//   across zones and a bare "09:00" is a class missed by an hour.
//
//   Always carry the reason. The teacher is made to type one, so it is
//   always there — and a cancellation without one reads as a mistake
//   somebody should ring the office about.
"use strict";

const mailer = require("./mailer");
const { env } = require("./env");
const site = require("./site");
const T = require("./mail-template");

const ZONE = (tz) => tz || "Europe/Berlin";

/** "Thursday 17 September, 09:00" on a clock where the class is. */
function whenIn(instant, tz) {
  if (!instant) return null;
  return new Date(instant).toLocaleString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONE(tz),
  });
}

/** The name to put on it: the course if there is one, the batch code otherwise. */
const nameOf = (lesson) => lesson.course_title || lesson.batch_code || "your class";

/**
 * Tell one student, and return whether it went.
 *
 * `kind` is "cancelled" or "moved". They differ enough in what has to
 * be said that one message trying to cover both would say neither
 * clearly.
 */
async function tell(student, lesson, kind) {
  const tz = ZONE(lesson.timezone);
  const course = nameOf(lesson);
  const when = whenIn(lesson.starts_at, tz);
  const was = whenIn(lesson.moved_from, tz);
  const first = String(student.name || "").split(" ")[0] || "there";

  const standIn = lesson.stand_in_name || null;

  const subject =
    kind === "cancelled"
      ? `Cancelled: ${course}, ${whenIn(lesson.starts_at, tz)}`
      : kind === "handover"
        ? `${course} on ${when} is with ${standIn}`
        : `Moved: ${course} is now ${when}`;

  // Pairs, not rendered rows. T.details() takes [label, value] and
  // calls T.row() itself — handing it finished HTML made it destructure
  // each string, so every line of the table came out as "<" and "t",
  // the first two characters of "<tr>". It reached real students
  // looking like that.
  const rows = [
    ["Course", course],
    ["Batch", lesson.batch_code || "—"],
  ];
  if (kind === "moved" && was) rows.push(["Was", was]);
  rows.push([kind === "cancelled" ? "Was due" : "Now", `${when} (${tz})`]);
  if (kind === "handover" && standIn) rows.push(["Taught by", standIn]);
  const why = kind === "handover" ? lesson.handover_note : lesson.change_note;
  if (why) rows.push(["Reason", why]);

  const lead =
    kind === "cancelled"
      ? `${course} on ${when} is not going ahead.`
      : kind === "handover"
        // The time has NOT changed, and saying so first stops the
        // message reading as another reschedule.
        ? `${course} on ${when} is going ahead as normal, with ${standIn} taking it.`
        : `${course} has moved${was ? ` from ${was}` : ""} to ${when}.`;

  const closing =
    kind === "cancelled"
      ? "Nothing to do — your other classes are unchanged, and this one will be picked up in the normal run of the course."
      : kind === "handover"
        ? "Same time, same link, same room. Only the teacher is different, and only for this one class."
        : "Your schedule in the portal already shows the new time.";

  const html = T.wrap({
    title:
      kind === "cancelled" ? "A class has been cancelled"
      : kind === "handover" ? "A different teacher for one class"
      : "A class has moved",
    body: [
      T.p(`Hello ${T.escapeHtml(first)},`),
      T.p(T.escapeHtml(lead)),
      T.details(rows),
      T.p(T.escapeHtml(closing)),
      // button(label, href) — the other way round put the URL on the
      // face of the button and the words in the link.
      T.button("See my schedule", `${site.origin}/portal/schedule`),
    ].join(""),
  });

  const text = [
    `Hello ${first},`,
    "",
    lead,
    "",
    `Course: ${course}`,
    `Batch:  ${lesson.batch_code || "—"}`,
    ...(kind === "moved" && was ? [`Was:    ${was}`] : []),
    `${kind === "cancelled" ? "Was due:" : "Now:    "} ${when} (${tz})`,
    ...(kind === "handover" && standIn ? [`Taught by: ${standIn}`] : []),
    ...(why ? [`Reason: ${why}`] : []),
    "",
    closing,
    "",
    `${site.origin}/portal/schedule`,
  ].join("\n");

  return mailer.send({ to: student.email, subject, text, html });
}

/**
 * Tell everybody on the batch.
 *
 * One message each rather than one message with everybody in the To
 * line: a class list is personal data, and putting twelve students'
 * addresses in front of each other is a leak nobody asked for. BCC
 * would technically avoid it and still sends one mail that a single
 * spam rule can swallow whole.
 *
 * Sequential on purpose. Shared hosting throttles SMTP, and a class of
 * twenty opened in parallel is how a provider decides you are sending
 * spam. Twenty messages one after another is a second or two.
 *
 * A failure to send is never a failure to change the lesson — the
 * change is already saved by the time this runs. The count comes back
 * so the page can say "emailed 11 of 12" rather than implying silence
 * meant success.
 */
async function announce(students, lesson, kind) {
  const list = (students || []).filter((s) => s && s.email);
  if (!list.length) return { sent: 0, total: 0, failed: [], configured: mailer.isConfigured() };
  if (!mailer.isConfigured()) {
    return { sent: 0, total: list.length, failed: [], configured: false };
  }

  let sent = 0;
  const failed = [];
  for (const student of list) {
    try {
      const res = await tell(student, lesson, kind);
      if (res && res.sent) sent++;
      else failed.push(student.name || student.email);
    } catch (e) {
      console.error(`Lesson mail to ${student.email} failed:`, e.message);
      failed.push(student.name || student.email);
    }
  }
  return { sent, total: list.length, failed, configured: true };
}

/**
 * Tell the office a class changed hands.
 *
 * A teacher can now give another teacher sight of a class list by
 * choosing a name from a dropdown. That is the flexibility that was
 * asked for, and the price of it is that nobody in the office would
 * otherwise know it happened. This is how they know, at the time,
 * rather than from a puzzled student in a fortnight.
 *
 * It says who arranged it as well as who is taking it, because "Frau
 * Weber is teaching Thursday" and "Herr Seraj gave Thursday to Frau
 * Weber" are different facts and only the second one is accountable.
 *
 * Sent to ENQUIRY_TO, which is the address the office already watches
 * for everything else. No address configured means no message, and the
 * hand-over still happens — this is a record, not a gate.
 */
async function tellOffice(lesson, { by, standIn }) {
  const to = env("ENQUIRY_TO") || env("SMTP_USER");
  if (!to || !mailer.isConfigured()) return { sent: false, reason: "no office address" };

  const tz = ZONE(lesson.timezone);
  const course = nameOf(lesson);
  const when = whenIn(lesson.starts_at, tz);

  const rows = [
    ["Course", course],
    ["Batch", lesson.batch_code || "—"],
    ["Class", `${when} (${tz})`],
    ["Now taught by", standIn ? `${standIn.name}${standIn.email ? ` <${standIn.email}>` : ""}` : "—"],
    ["Arranged by", by ? `${by.name}${by.email ? ` <${by.email}>` : ""}` : "—"],
  ];
  if (lesson.handover_note) rows.push(["Reason", lesson.handover_note]);

  const html = T.wrap({
    title: "A class has been handed to another teacher",
    body: [
      T.p(
        T.escapeHtml(
          `${course} on ${when} will be taught by ${standIn ? standIn.name : "somebody else"}.`
        )
      ),
      T.details(rows),
      T.p(
        T.escapeHtml(
          "They can see that one lesson and take that register. They cannot open the batch, its other registers, its class list or its materials."
        )
      ),
    ].join(""),
  });

  const text = [
    `${course} on ${when} will be taught by ${standIn ? standIn.name : "somebody else"}.`,
    "",
    `Course: ${course}`,
    `Batch:  ${lesson.batch_code || "—"}`,
    `Class:  ${when} (${tz})`,
    `Now taught by: ${standIn ? standIn.name : "—"}`,
    `Arranged by:   ${by ? by.name : "—"}`,
    ...(lesson.handover_note ? [`Reason: ${lesson.handover_note}`] : []),
    "",
    "They can see that one lesson and take that register. They cannot open",
    "the batch, its other registers, its class list or its materials.",
  ].join("\n");

  return mailer.send({
    to,
    subject: `Hand-over: ${course}, ${when}`,
    text,
    html,
  });
}

module.exports = { announce, tell, tellOffice, whenIn };
