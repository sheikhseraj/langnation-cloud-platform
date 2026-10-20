#!/usr/bin/env node
// Signs in to CloudLabs and starts the AWS sandbox lab if it is not already running.
//
// Usage:
//   node scripts/start-sandbox.mjs            start the lab (needs credentials)
//   node scripts/start-sandbox.mjs --check    verify the login selectors only, no sign-in
//
// Environment:
//   CLOUDLABS_LOGIN_ID   required unless --check
//   CLOUDLABS_PASSWORD   required unless --check
//   CLOUDLABS_LAB_NAME   lab card to open (default "AWS Account Lab")
//   CLOUDLABS_URL        portal home (default the Neuefische company home)
//   CLOUDLABS_DEBUG      "1" to save screenshots to ./debug (may show lab credentials)
//   CLOUDLABS_HEADFUL    "1" to watch the run in a real browser window

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const HOME_URL =
  process.env.CLOUDLABS_URL ||
  "https://cloudlabs.nuvepro.com/company/Neuefische/home";
const LAB_NAME = process.env.CLOUDLABS_LAB_NAME || "AWS Account Lab";
const CHECK_ONLY = process.argv.includes("--check");
const DEBUG = process.env.CLOUDLABS_DEBUG === "1";
const HEADFUL = process.env.CLOUDLABS_HEADFUL === "1";

// The portal renders two sign-in forms: a hidden one in the nav dropdown
// (#userName) and the visible one in the page body (#sl_userName). Matching by
// placeholder hits both and Playwright aborts on the ambiguity, so target the
// visible form by id.
const LOGIN = {
  user: "#sl_userName",
  password: "#sl_password",
  submit: "#user_sign_in_button",
  error: "#sl_loginError",
};

const log = (...args) => console.log(...args);

// Lab pages can display temporary AWS credentials. Strip anything that looks
// like a key before it reaches the Actions log.
function redact(value) {
  return String(value ?? "")
    .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{8,}\b/g, "[redacted-access-key]")
    .replace(/\b[A-Za-z0-9/+=_-]{24,}\b/g, "[redacted]");
}

function exactly(word) {
  return new RegExp(`^\\s*${word}\\s*$`, "i");
}

// Matches a clickable control by its accessible name, falling back to plain
// text for portals that style divs as buttons.
function control(scope, word) {
  const name = exactly(word);
  return scope
    .getByRole("button", { name })
    .or(scope.getByRole("link", { name }))
    .or(scope.locator(`[title="${word}" i]`))
    .or(scope.getByText(name));
}

async function firstVisible(locator, timeoutMs = 0) {
  const deadline = Date.now() + timeoutMs;
  do {
    for (const candidate of await locator.all()) {
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    if (Date.now() < deadline) await new Promise((r) => setTimeout(r, 1000));
  } while (Date.now() < deadline);
  return null;
}

async function shoot(page, name) {
  if (!DEBUG) return;
  await mkdir("debug", { recursive: true });
  await page.screenshot({ path: `debug/${name}.png`, fullPage: true });
  log(`  saved debug/${name}.png`);
}

// Dumps short labels of interactive elements so a failed run says what the page
// actually offered, without echoing long secret-shaped strings.
async function describePage(page) {
  log(`  url:   ${redact(page.url())}`);
  log(`  title: ${redact(await page.title().catch(() => "?"))}`);
  const labels = await page
    .locator('button, a, [role="button"], input[type="submit"]')
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => n.offsetParent || n.getClientRects().length)
        .map((n) => (n.innerText || n.value || n.title || "").trim())
        .filter((t) => t && t.length <= 40),
    )
    .catch(() => []);
  const unique = [...new Set(labels)].map(redact);
  log(`  visible controls: ${unique.join(" | ") || "(none)"}`);
}

async function assertLoginForm(page) {
  for (const [field, selector] of Object.entries(LOGIN)) {
    if (field === "error") continue;
    const count = await page.locator(selector).count();
    if (count !== 1) {
      throw new Error(
        `Login selector ${selector} (${field}) matched ${count} elements, expected 1. The portal markup changed.`,
      );
    }
    const visible = await page.locator(selector).isVisible();
    log(`  ${selector.padEnd(22)} 1 match, visible=${visible}`);
    if (!visible) throw new Error(`Login field ${selector} is present but hidden.`);
  }
}

async function signIn(page) {
  await page.fill(LOGIN.user, process.env.CLOUDLABS_LOGIN_ID);
  await page.fill(LOGIN.password, process.env.CLOUDLABS_PASSWORD);
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout: 90_000 }).catch(() => {}),
    page.click(LOGIN.submit),
  ]);

  // The portal re-renders the form in place on a bad password rather than
  // navigating, so treat a still-visible password box as a failed sign-in.
  const stillOnForm = await page
    .locator(LOGIN.password)
    .isVisible()
    .catch(() => false);
  if (stillOnForm) {
    const message = await page
      .locator(LOGIN.error)
      .inputValue()
      .catch(() => "");
    throw new Error(
      `Sign-in did not complete. ${
        message
          ? `Portal said: ${redact(message)}`
          : "Check CLOUDLABS_LOGIN_ID and CLOUDLABS_PASSWORD."
      }`,
    );
  }
  log("Signed in.");
}

async function openLab(page) {
  const card = await firstVisible(
    page.getByText(LAB_NAME, { exact: false }),
    60_000,
  );
  if (!card) {
    await describePage(page);
    throw new Error(
      `No lab named "${LAB_NAME}" on the dashboard. Set CLOUDLABS_LAB_NAME to the exact tile name.`,
    );
  }

  // The tile itself is the link on some themes and carries a "View Lab" button
  // on others, so prefer an explicit button and fall back to the tile.
  const viewButton = await firstVisible(control(page, "View Lab"));
  await (viewButton ?? card).click();
  await page.waitForLoadState("networkidle", { timeout: 90_000 }).catch(() => {});
  log(`Opened "${LAB_NAME}".`);
  await shoot(page, "lab-page");
}

async function startLab(page) {
  const stop = await firstVisible(control(page, "Stop"), 30_000);
  if (stop) {
    log("Lab is already running (Stop is showing). Nothing to do.");
    return;
  }

  const start = await firstVisible(control(page, "Start"), 30_000);
  if (!start) {
    await describePage(page);
    await shoot(page, "no-start-button");
    throw new Error("Neither Start nor Stop is visible on the lab page.");
  }

  await start.click();
  log("Clicked Start, waiting for the lab to come up...");

  // Some tenants pop a confirmation before provisioning begins.
  const confirm = await firstVisible(
    control(page, "Yes").or(control(page, "Confirm")).or(control(page, "OK")),
    5_000,
  );
  if (confirm) {
    await confirm.click();
    log("Confirmed the start dialog.");
  }

  const running = await firstVisible(control(page, "Stop"), 600_000);
  if (!running) {
    await describePage(page);
    await shoot(page, "start-timeout");
    throw new Error("Start was clicked but the lab never reported as running.");
  }
  log("AWS sandbox is running.");
  await shoot(page, "running");
}

async function main() {
  if (!CHECK_ONLY) {
    for (const key of ["CLOUDLABS_LOGIN_ID", "CLOUDLABS_PASSWORD"]) {
      if (!process.env[key]) {
        throw new Error(`Missing required environment variable ${key}.`);
      }
    }
  }

  const browser = await chromium.launch({ headless: !HEADFUL });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);

  try {
    log(`Opening ${HOME_URL}`);
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 90_000 });

    log("Checking the sign-in form...");
    await assertLoginForm(page);

    if (CHECK_ONLY) {
      log("\nSelector check passed: the login form is reachable and unambiguous.");
      return;
    }

    await signIn(page);
    await openLab(page);
    await startLab(page);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("\nCloudLabs start automation failed.");
  console.error(redact(error.message));
  process.exitCode = 1;
});
