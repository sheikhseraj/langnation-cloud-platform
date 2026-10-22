// What the candidate hears, and when.
//
// Two messages, and the difference between them is the whole point of
// having a teacher in the loop:
//
//   1. On finishing  — a welcome and the provisional level, straight
//      away, because somebody who has just spent twenty minutes on a
//      test should not be left wondering.
//   2. After review  — the confirmed level, whether or not it changed.
//      Sent even when nothing changed: silence reads as being
//      forgotten, and "we looked and you were right" is worth saying.

const mailer = require("./mailer");
const site = require("./site");
const T = require("./mail-template");

/** What a level lets you do, in words somebody recognises themselves in. */
const CAN_DO = {
  A1: {
    en: "introduce yourself, ask and answer simple questions, and get by in very familiar situations",
    de: "sich vorstellen, einfache Fragen stellen und beantworten und sich in vertrauten Situationen verständigen",
  },
  A2: {
    en: "handle everyday exchanges — shopping, appointments, describing your routine",
    de: "den Alltag bewältigen — einkaufen, Termine, Ihren Tagesablauf beschreiben",
  },
  B1: {
    en: "cope with most situations while travelling, describe experiences and give reasons for your opinions",
    de: "die meisten Situationen auf Reisen bewältigen, Erlebnisse beschreiben und Meinungen begründen",
  },
  B2: {
    en: "follow complex texts and technical discussion in your field, and talk with native speakers without strain",
    de: "komplexe Texte und Fachdiskussionen verstehen und sich mühelos mit Muttersprachlern unterhalten",
  },
  C1: {
    en: "use German fluently and spontaneously for academic and professional purposes",
    de: "Deutsch fließend und spontan im Studium und Beruf verwenden",
  },
  C2: {
    en: "handle nuance, idiom and register with near-native precision",
    de: "Nuancen, Redewendungen und Register nahezu muttersprachlich beherrschen",
  },
};

const canDo = (level, lang) => (CAN_DO[level] || CAN_DO.A2)[lang] || CAN_DO[level].en;

/**
 * Sent the moment the test is finished.
 *
 * Deliberately warm and deliberately provisional. The level is real
 * information and worth giving immediately, but calling it final before
 * anybody has read their writing would be a claim we cannot support.
 */
async function sendProvisional({ name, email, level, percent, minutes, wroteWords, lang = "en" }) {
  const de = lang === "de";

  const html = T.wrap({
    title: de ? "Ihr Einstufungsergebnis" : "Your placement result",
    body:
      T.p(de ? `Hallo ${T.escapeHtml(name)},` : `Hello ${T.escapeHtml(name)},`) +
      T.p(
        de
          ? "danke, dass Sie sich die Zeit genommen haben. Hier ist Ihr vorläufiges Ergebnis."
          : "Thank you for taking the time. Here is your provisional result."
      ) +
      `<div style="text-align:center;margin:22px 0">
         <div style="display:inline-block;background:${T.NAVY};color:#fff;border-radius:50%;width:84px;height:84px;line-height:84px;font-size:30px;font-weight:700">${T.escapeHtml(level)}</div>
       </div>` +
      T.p(
        de
          ? `Auf diesem Niveau können Sie ${canDo(level, "de")}.`
          : `At this level you can ${canDo(level, "en")}.`
      ) +
      T.details(
        de
          ? { Niveau: level, Ergebnis: `${percent}%`, Dauer: `ca. ${minutes} Min.`, Schreibaufgabe: wroteWords ? `${wroteWords} Wörter` : "übersprungen" }
          : { Level: level, Score: `${percent}%`, Time: `about ${minutes} min`, "Written task": wroteWords ? `${wroteWords} words` : "skipped" }
      ) +
      T.p(
        wroteWords
          ? de
            ? "<strong>Was jetzt passiert:</strong> Eine Lehrkraft liest Ihren Text und bestätigt dieses Niveau — oder korrigiert es, wenn Ihr Deutsch besser ist, als die Fragen zeigen konnten. Sie bekommen dann eine zweite E-Mail von uns."
            : "<strong>What happens next:</strong> a teacher will read what you wrote and confirm this level — or adjust it, if your German is better than the questions could show. You will get a second email from us."
          : de
            ? "<strong>Was jetzt passiert:</strong> Sie haben die Schreibaufgabe übersprungen, daher beruht dieses Niveau nur auf den Auswahlfragen. Wir bestätigen es in Ihrer ersten Stunde."
            : "<strong>What happens next:</strong> you skipped the written task, so this level rests on the multiple-choice questions alone. We will confirm it in your first lesson."
      ) +
      `<div style="margin-top:20px">${T.button(
        de ? "Kurse auf diesem Niveau ansehen" : "See courses at this level",
        `${site.origin}/courses`
      )}</div>`,
    footer: de
      ? "Fragen? Antworten Sie einfach auf diese E-Mail."
      : "Questions? Just reply to this email.",
  });

  return mailer.send({
    to: email,
    subject: de ? `Ihr Einstufungsergebnis: ${level}` : `Your placement result: ${level}`,
    html,
    text: T.text([
      de ? `Hallo ${name},` : `Hello ${name},`,
      "",
      de ? `Ihr vorläufiges Niveau: ${level}` : `Your provisional level: ${level}`,
      de ? `Ergebnis: ${percent}% in ca. ${minutes} Minuten` : `Score: ${percent}% in about ${minutes} minutes`,
      "",
      wroteWords
        ? de
          ? "Eine Lehrkraft liest jetzt Ihren Text und bestätigt das Niveau. Sie hören noch einmal von uns."
          : "A teacher will now read your writing and confirm the level. You will hear from us again."
        : de
          ? "Sie haben die Schreibaufgabe übersprungen; wir bestätigen das Niveau in Ihrer ersten Stunde."
          : "You skipped the written task; we will confirm the level in your first lesson.",
      "",
      `${site.origin}/courses`,
    ]),
  });
}

/**
 * Sent once a teacher has decided.
 *
 * Says plainly whether the level moved. A student whose level was
 * raised should be told so, and one whose level was lowered deserves
 * the reason rather than a bare letter.
 */
async function sendFinal({ name, email, provisional, level, note, lang = "en" }) {
  const de = lang === "de";
  const changed = provisional && provisional !== level;

  const html = T.wrap({
    title: de ? "Ihr endgültiges Niveau" : "Your confirmed level",
    body:
      T.p(de ? `Hallo ${T.escapeHtml(name)},` : `Hello ${T.escapeHtml(name)},`) +
      T.p(
        de
          ? "eine Lehrkraft hat Ihren Test und Ihren Text angesehen. Das ist Ihr bestätigtes Niveau."
          : "A teacher has looked at your test and your writing. This is your confirmed level."
      ) +
      `<div style="text-align:center;margin:22px 0">
         <div style="display:inline-block;background:#2f7d55;color:#fff;border-radius:50%;width:84px;height:84px;line-height:84px;font-size:30px;font-weight:700">${T.escapeHtml(level)}</div>
       </div>` +
      (changed
        ? T.p(
            de
              ? `Nach dem Test lag Ihr vorläufiges Niveau bei <strong>${T.escapeHtml(provisional)}</strong>. Nach dem Lesen Ihres Textes haben wir es auf <strong>${T.escapeHtml(level)}</strong> angepasst — genau dafür gibt es die Schreibaufgabe.`
              : `The test put you provisionally at <strong>${T.escapeHtml(provisional)}</strong>. After reading your writing we have adjusted that to <strong>${T.escapeHtml(level)}</strong> — which is exactly what the written task is for.`
          )
        : T.p(
            de
              ? "Der Test lag richtig — das Niveau bleibt unverändert."
              : "The test had it right — your level is unchanged."
          )) +
      T.p(de ? `Auf diesem Niveau können Sie ${canDo(level, "de")}.` : `At this level you can ${canDo(level, "en")}.`) +
      (note ? T.quoted(de ? "Anmerkung Ihrer Lehrkraft" : "Note from your teacher", note) : "") +
      `<div style="margin-top:20px">${T.button(
        de ? "Kurse auf diesem Niveau" : "Courses at this level",
        `${site.origin}/courses`,
        "approve"
      )}${T.button(de ? "Beratung anfragen" : "Ask us about a course", `${site.origin}/contact`)}</div>`,
    footer: de
      ? "Wenn sich das nicht richtig anfühlt, sagen Sie es uns — wir stufen in der ersten Stunde gern um."
      : "If this does not feel right, tell us — we are happy to move you in the first lesson.",
  });

  return mailer.send({
    to: email,
    subject: de ? `Ihr bestätigtes Niveau: ${level}` : `Your confirmed level: ${level}`,
    html,
    text: T.text([
      de ? `Hallo ${name},` : `Hello ${name},`,
      "",
      de ? `Ihr bestätigtes Niveau: ${level}` : `Your confirmed level: ${level}`,
      changed
        ? de
          ? `(vorläufig war ${provisional})`
          : `(provisionally ${provisional})`
        : de
          ? "Der Test lag richtig — unverändert."
          : "The test had it right — unchanged.",
      note ? "" : null,
      note ? (de ? `Anmerkung: ${note}` : `Note: ${note}`) : null,
      "",
      `${site.origin}/courses`,
    ]),
  });
}

module.exports = { sendProvisional, sendFinal, canDo };
