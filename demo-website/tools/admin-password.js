// Turn a password into a bcrypt hash for ADMIN_PASSWORD_HASH in .env.
//
//   npm run admin:password
//
// The password is typed here and hashed immediately; only the hash is ever
// written down. Nothing is stored by this script.
"use strict";

const readline = require("readline");
const bcrypt = require("bcryptjs");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// Hide the typed characters so the password does not stay in the terminal
// scrollback or in a screen recording.
function askHidden(question) {
  return new Promise((resolve) => {
    const onData = (char) => {
      if (["\n", "\r", "\u0004"].includes(String(char))) {
        process.stdin.removeListener("data", onData);
        return;
      }
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(question + "*".repeat(rl.line.length));
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => resolve(answer));
  });
}

async function main() {
  console.log("\n  Create the password for the /admin enquiries page.");
  console.log("  Use something long — a passphrase of four random words is ideal.\n");

  const password = (await askHidden("  Password: ")).trim();
  process.stdout.write("\n");

  if (password.length < 10) {
    console.error("\n  Too short — use at least 10 characters.\n");
    rl.close();
    process.exit(1);
  }

  const confirm = (await askHidden("  Confirm:  ")).trim();
  process.stdout.write("\n");

  if (password !== confirm) {
    console.error("\n  The two entries did not match.\n");
    rl.close();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  rl.close();

  console.log(`
  ────────────────────────────────────────────────────────────
  Add this line to your .env file:

  ADMIN_PASSWORD_HASH=${hash}

  Keep the password itself in your password manager.
  It cannot be recovered from the hash — only replaced.
  ────────────────────────────────────────────────────────────
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
