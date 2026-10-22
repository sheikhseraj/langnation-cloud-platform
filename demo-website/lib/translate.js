// English → German via DeepL.
//
// Used by the Translate button in /rootadmin: you write the English, press
// it, and the German fields fill in for you to check before saving. The
// review step is deliberate — this is a site that teaches German, and
// unreviewed machine output on the German pages would undercut the whole
// proposition.
//
// Needs DEEPL_API_KEY. Without one, isEnabled() is false and the button
// is not rendered, rather than rendered and broken.
//
// tag_handling=html matters: the course bodies are HTML, and DeepL will
// translate the text while leaving the markup intact. Without it the
// tags come back mangled or translated.

const { env } = require("./env");

/** Free keys end in ":fx" and use a different host to paid ones. */
function endpoint() {
  const key = env("DEEPL_API_KEY", "");
  return key.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
}

const isEnabled = () => Boolean(env("DEEPL_API_KEY", ""));

/**
 * Translate several strings at once.
 *
 * DeepL accepts up to 50 texts per request, which comfortably covers one
 * course form, so this is a single call rather than one per field.
 *
 * Returns an array the same length and order as `texts`. Throws on a
 * transport or API error — the caller reports it rather than silently
 * leaving the German blank.
 */
async function toGerman(texts, { html = true } = {}) {
  const key = env("DEEPL_API_KEY", "");
  if (!key) throw new Error("No DEEPL_API_KEY is set.");

  const list = texts.map((t) => (t == null ? "" : String(t)));
  // Empty strings would waste quota and DeepL rejects a wholly empty
  // request, so only the non-empty ones are sent.
  const send = list.map((t, i) => [i, t]).filter(([, t]) => t.trim() !== "");
  if (!send.length) return list;

  const body = new URLSearchParams();
  body.set("target_lang", "DE");
  body.set("source_lang", "EN");
  // Sie rather than du: this is a school addressing prospective students.
  body.set("formality", "prefer_more");
  if (html) body.set("tag_handling", "html");
  for (const [, t] of send) body.append("text", t);

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: "DeepL-Auth-Key " + key,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // 456 is DeepL's "quota exceeded", which is worth naming plainly
    // rather than reporting as a generic failure.
    if (res.status === 456) throw new Error("DeepL quota for this month is used up.");
    if (res.status === 403) throw new Error("DeepL rejected the API key.");
    throw new Error(`DeepL returned ${res.status}. ${detail.slice(0, 200)}`);
  }

  const json = await res.json();
  const out = (json.translations || []).map((t) => t.text);
  if (out.length !== send.length) {
    throw new Error("DeepL returned a different number of texts than were sent.");
  }

  // Put them back where they came from, leaving the empties empty.
  const result = list.slice();
  send.forEach(([i], n) => {
    result[i] = out[n];
  });
  return result;
}

/** Characters used and the monthly limit, for showing in the editor. */
async function usage() {
  const key = env("DEEPL_API_KEY", "");
  if (!key) return null;
  const host = key.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  try {
    const res = await fetch(host + "/v2/usage", {
      headers: { Authorization: "DeepL-Auth-Key " + key },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return { used: j.character_count, limit: j.character_limit };
  } catch {
    return null;
  }
}

module.exports = { isEnabled, toGerman, usage };
