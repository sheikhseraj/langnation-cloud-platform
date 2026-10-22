# Publishing the phone app with PWABuilder

The website is already a complete PWA. Everything PWABuilder looks for is
in place: a web manifest, a service worker with offline support, and the
full icon set including maskable and monochrome variants.

This is a **separate app from the LangNation Dictionary**. Different app
id, its own store listing. The dictionary app is not affected in any way.

| | Dictionary | This site |
|---|---|---|
| App id | `com.langnation.dictionary` | `com.langnation.school` |
| Name | LangNation Dictionary | LangNation Language Institute |
| URL | langnation.de | langnation.com |

---

## Before you start

The site must be **live on HTTPS at its real domain**. PWABuilder reads
the deployed site — it cannot package from your computer.

Check <https://www.langnation.com/manifest.webmanifest> loads in a
browser and shows JSON.

---

## Android (Google Play)

1. Go to <https://www.pwabuilder.com>
2. Enter `https://www.langnation.com` → **Start**
3. It scores the manifest, service worker and security. All three should
   be green. If not, the report says exactly which field is missing.
4. **Package for stores → Android → Google Play**
5. Check these values:

   | Field | Value |
   |---|---|
   | Package ID | `com.langnation.school` |
   | App name | LangNation Language Institute |
   | Short name | LangNation |
   | Start URL | `/` |
   | Display mode | Standalone |
   | Signing key | **Create new** (first time only) |

6. Download the zip. It contains:
   - `app-release-bundle.aab` — upload this to Play Console
   - `signing.keystore` and `signing-key-info.txt`
   - `assetlinks.json`

7. **Back up the keystore and its passwords immediately**, in your
   password manager and one other place. If you lose it you can never
   update the app again — you would have to publish a new listing and
   your users would have to reinstall. This is the single most important
   file in the whole process.

8. Open `assetlinks.json` from the zip and copy the
   `sha256_cert_fingerprints` value into
   `public/.well-known/assetlinks.json` in this project, replacing
   `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PWABUILDER`. Commit, deploy,
   restart.

9. Confirm <https://www.langnation.com/.well-known/assetlinks.json>
   returns your real fingerprint.

   **This step is not optional.** Without it, Android shows a browser
   address bar across the top of your app instead of running it full
   screen.

10. Upload the `.aab` in Play Console → Production → Create release.

---

## iOS (App Store)

1. Same PWABuilder report → **Package for stores → iOS**
2. Bundle ID: `com.langnation.school`
3. Download and unzip. You need a Mac with Xcode to build and submit —
   the same route you used for the dictionary app.

Apple reviewers reject apps that are "just a website". The pages that
justify this one are the course catalogue, the two calculators and the
offline behaviour. Point at those in the review notes if it is queried.

---

## Windows

**Package for stores → Windows** produces an `.msix` for the Microsoft
Store. Optional; the same package id applies.

---

## Store listing assets

Already generated in this project:

| Asset | File |
|---|---|
| App icon 512 | `public/icons/icon-512.png` |
| Maskable icon | `public/icons/icon-maskable-512.png` |
| Monochrome icon | `public/icons/icon-monochrome-512.png` |
| Feature graphic / social card | `public/img/og-default.png` (1200×630) |

You still need **screenshots** from a real phone. Take them at
`/`, `/courses`, a course detail page, and `/tools`. Play Store wants at
least two; App Store wants a set per device size.

---

## After an update to the website

The app is a wrapper around the live site, so **content updates appear
without republishing the app**. Deploy the website and the app shows the
new content.

You only need to republish the app if you change the manifest — the name,
the icons, the start URL or the app id.

One thing to remember: bump `CACHE` in `public/sw.js` when you change
which files are in the offline shell, or returning visitors keep the old
copy.
