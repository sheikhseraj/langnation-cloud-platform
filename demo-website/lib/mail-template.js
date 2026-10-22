// The house style for every email the site sends.
//
// This markup was written once for the enquiry notification and looked
// good, so it is now the shell for everything: account requests,
// approvals, refusals, student verification. One place to change the
// colours, one place to fix a rendering bug in Outlook.
//
// Email HTML is not web HTML. Everything is inline styles and tables,
// because Gmail strips <style> blocks, Outlook ignores flexbox and grid,
// and anything clever degrades into a mess somewhere. It looks dated on
// purpose — it is the only thing that renders the same everywhere.
//
// Every message also carries a plain-text alternative. Some clients show
// it, some people prefer it, and a message with no text part scores
// worse with spam filters.

const site = require("./site");

const NAVY = "#1b3464";
const GOLD = "#c08b25";
const INK = "#0f1f47";
const MUTED = "#5e6f90";
const LINE = "#d0d8ea";
const PAPER = "#f4f6fb";

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One label/value line in the details table. Omitted when empty. */
function row(label, value) {
  if (!value) return "";
  return `<tr>
    <td style="padding:6px 14px 6px 0;color:${MUTED};font-size:13px;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-size:14px;color:${INK}"><strong>${escapeHtml(value)}</strong></td>
  </tr>`;
}

/** A block of label/value lines. Pass an object or an array of pairs. */
function details(pairs) {
  const list = Array.isArray(pairs) ? pairs : Object.entries(pairs);
  const body = list.map(([k, v]) => row(k, v)).join("");
  if (!body) return "";
  return `<table style="width:100%;border-collapse:collapse">${body}</table>`;
}

/** A paragraph in the body. */
function p(text) {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:${INK}">${text}</p>`;
}

/** The visitor's own words, kept apart from ours and never interpreted. */
function quoted(label, text) {
  return `<div style="margin-top:18px;padding-top:16px;border-top:1px solid ${LINE}">
    <div style="color:${MUTED};font-size:13px;margin-bottom:6px">${escapeHtml(label)}</div>
    <div style="font-size:14px;line-height:1.6;color:${INK};white-space:pre-wrap">${escapeHtml(text)}</div>
  </div>`;
}

/**
 * A button. `tone` picks the colour: gold for the ordinary action, green
 * to approve, red to refuse — so a decision email cannot be misread at a
 * glance.
 */
function button(label, href, tone = "gold") {
  const bg = tone === "approve" ? "#2f7d55" : tone === "deny" ? "#a33242" : GOLD;
  return `<a href="${escapeHtml(href)}"
    style="display:inline-block;margin:6px 8px 0 0;background:${bg};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(label)}</a>`;
}

/**
 * Wrap body HTML in the branded shell.
 *
 * `title` is the heading in the navy bar; `footer` is optional small
 * print under the card.
 */
function wrap({ title, body, footer = "" }) {
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:${PAPER};padding:28px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${NAVY}">
      <tr>
        <td style="padding:16px 20px;vertical-align:middle">
          <div style="font-size:18px;font-weight:600;color:#ffffff">${escapeHtml(title)}</div>
          <!-- The address, as a link we style ourselves.

               It was a plain div reading "langnation.com" in white at
               75% opacity. Mail clients hunt for bare domains and turn
               them into links of their own, and Gmail's link colour is
               a mid blue -- which on this navy bar is invisible. The
               fix is to get there first: an anchor of our own, coloured
               explicitly, is left alone.

               !important inside a style attribute, which is not usual
               and is deliberate: Gmail rewrites anchor colour by
               injecting its own rule, and that is what it takes to
               outrank it. The inner span is belt and braces for the
               clients that colour the text node rather than the anchor.

               The numbers, since this was reported as "not visible"
               rather than guessed at: Gmail's link blue is #1155cc,
               which against this navy is 1.86:1 -- below the 3:1 that
               even large text needs, and it looked like the line was
               missing. #cdd9ef is 8.58:1.

               No opacity either. It is unreliable across clients, and a
               literal colour is the same effect with none of the
               doubt. -->
          <div style="font-size:13px;line-height:1.5">
            <a href="${site.origin}" style="color:#cdd9ef !important;text-decoration:none">
              <span style="color:#cdd9ef !important;text-decoration:none">${escapeHtml((site.hostname || "langnation.com").replace(/^www\./, ""))}</span>
            </a>
          </div>
        </td>
        <td width="76" style="padding:14px 20px 14px 0;text-align:right;vertical-align:middle">
          <!-- A table rather than flexbox: Outlook on Windows renders mail
               through Word and ignores modern layout entirely. The size is
               given as width/height attributes as well as CSS, so the row
               holds its shape even when images are blocked — which they
               are by default in most clients. Empty alt, because the
               heading beside it already says what this is. -->
          <img src="${site.origin}/icons/email-seal.png" width="56" height="56"
               alt="" style="display:block;border:0;margin-left:auto;width:56px;height:56px">
        </td>
      </tr>
    </table>
    <div style="padding:22px 24px">
${body}
    </div>
  </div>
  ${
    footer
      ? `<div style="max-width:600px;margin:14px auto 0;color:${MUTED};font-size:12px;line-height:1.6;text-align:center">${footer}</div>`
      : ""
  }
</div>`;
}

/** Turn a list of lines into the plain-text alternative. */
function text(lines) {
  return lines.filter((l) => l !== null && l !== undefined && l !== false).join("\n");
}

module.exports = { wrap, details, row, p, quoted, button, text, escapeHtml, NAVY, GOLD, INK, MUTED, LINE };
