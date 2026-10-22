// Reads a .env file into process.env, the same way the dictionary does.
// Kept dependency-free on purpose: Hostinger can also set real environment
// variables in hPanel, and those must always win over the file.
"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv(file = path.join(__dirname, "..", ".env")) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return; // No .env — fine on hosts that inject real env vars.
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue; // real env var wins
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

/** Read a variable, with an optional default. Throws if required and missing. */
function env(key, fallback = undefined, { required = false } = {}) {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (required) throw new Error(`Missing required environment variable: ${key}`);
    return fallback;
  }
  return v;
}

const bool = (key, fallback = false) => {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return /^(1|true|yes|on)$/i.test(v);
};

module.exports = { loadEnv, env, bool };
