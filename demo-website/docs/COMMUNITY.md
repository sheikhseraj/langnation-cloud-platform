# LangNation WhatsApp Community

The community module was adapted from Portfolio v02 into LangNation's Express 4 / EJS / shared MySQL architecture. Portfolio v02 is retained unchanged. Nothing has been deployed or applied to a database by this transfer.

## Architecture

- Public pages: /community and /de/community, existing header, footer, EN/DE locale routing, theme, site.css and app.js.
- Admin: /admin/community, with overview, join-requests, groups, members, reports, warnings, blocks, settings, audit-logs. Existing office authentication guards every page and API. No new login, session, portal, pool or dependency.
- Public API: /api/community/config, groups, POST join-requests, POST reports (only when enabled).
- Admin API: /admin/community/api; settings, overview, groups CRUD/private invite, requests decision/rescreen/manual handoff, members/memberships, reports, warnings, blocks, notes, privacy exports/anonymization, audit logs.
- lib/community contains validation, explainable screening, transactional services and repositories backed by lib/db. It does not connect to WhatsApp.
- Express 4 async handlers forward failures to the module's error handler; CSRF uses existing lib/csrf and no-store responses. Admin APIs stay under /admin so the existing path-scoped login cookie is sent.

## Schema and setup

1. Review MySQL/38_community.sql. It only creates eleven namespaced tables; no existing rows or tables are changed. LangNation's existing migration runner classifies it as an additive schema migration and runs it on a future ordinary server start if AUTO_MIGRATE is on. No server start or migration was performed here.
2. Run MySQL/community-settings.sql manually once after schema migrations 38 and 39 are present. It is intentionally unnumbered: this project's migration runner does not automatically run data changes. INSERT IGNORE leaves existing settings untouched. Fresh initialization now uses the explicitly requested ON availability defaults and supplied notices; existing settings are never overwritten. Review before running this initialization on a new installation.
3. Set a stable SESSION_SECRET of at least 32 characters and an existing ADMIN_PASSWORD_HASH (preferred) or strong ADMIN_PASSWORD of at least 12 characters.
4. Only if storing private invite URLs, set COMMUNITY_ENCRYPTION_KEY to 64 random hexadecimal characters. Keep it securely backed up; losing it makes stored links unreadable. Do not commit secrets. No key is needed for manual instruction-only handoffs.
5. Sign in through /admin and open /admin/community/settings. Supply controller/contact, purpose, lawful basis, retention review period and rights in the privacy notice. Review rules. Bump the corresponding version each time rules/privacy text changes.
6. Create city groups using /admin/community/groups. Course intakes.whatsapp_url values are deliberately separate and never imported or publicly exposed. Mark desired groups ACTIVE/public and accepting applications. Enable global community/applications last.

## Operations

Review an application, inspect screening reasons and history, and make a human approval/rejection/review decision. Blocked resubmissions are stored and flagged for review. Approval creates a pending membership. Open manual handoff, privately contact the applicant and perform the action in WhatsApp. Record actual admission only after verifying it manually; it marks membership ACTIVE. There is no browser automation, scraping, message surveillance, bulk messaging or unofficial API.

Reports are entered manually or through the optional public form. Create warnings linked to a member/report; default progression ends at removal recommended. Internal blocks/unblocks are explicit human decisions and do not remove/add anyone on WhatsApp. Record membership LEFT/REMOVED only after manual confirmation.

Existing office login identifies a shared administrator, so actor IDs are NULL and actor_kind is SHARED_ADMIN. Future user IDs reference existing admin_users (unsigned), never an invented users table. Personal report assignment is unavailable until office authentication supports individual accounts. Community records use namespaced audit/settings tables in the same database because their structured decision history, actor kind, policy versions and privacy scrubbing do not match the existing generic content settings and office audit schemas.

## Privacy and security

List phones are masked, details are admin-only, private invites are AES-256-GCM encrypted and excluded from public responses. Notes, reports, blocks and screening reasons never appear in public APIs. CSRF protects submissions/mutations, same-origin checks and bounded in-memory per-IP/per-phone rate limits reduce abuse, and public honeypots reject bot-filled fields. Rate limits are per process; multi-instance hosting would need shared limits later. No additional PII is placed in local storage, analytics events or audit metadata. Service worker excludes community pages as well as existing private admin and /api paths, avoiding cached form tokens/notices. Downloaded privacy exports require secure handling and third-party data redaction before sharing.

Retention days are an administrator review period, not automatic deletion. Anonymization explicitly scrubs community identifying data after active blocks are resolved; it leaves the audit trail. Hosting backups require their own retention process. Applicants do not need student accounts. No protected-trait inference or identity-document collection.

## Costs and boundaries

No dependencies or paid services were added. Existing hosting/database/storage costs continue. Rule screening uses no AI key or network provider. The screening abstraction remains available for a later privacy-reviewed optional AI adapter; enabling AI is currently rejected. Existing website chat is unrelated and is not called by this feature. Dashboard notifications and neutral public receipt confirmations are available; applicant decision delivery is manual. SMTP notifications, broadcasts and file uploads were not added.

## Validation and release

Run npm run check:community and existing npm run check. Tests use injected driver fixtures and local HTTP/EJS rendering, never production MySQL or WhatsApp. Do not run database connectivity checks or start the real server against a live .env as a development test. A live MySQL smoke test remains a release prerequisite: duplicate phone, transaction rollback, consent versions, approval/pending admission, reports/warnings, privacy, and restrictive FK behavior.

Before deployment, back up the shared database and existing code, review these additive scripts and configure secrets/notice. Deploy through the existing LangNation process, then verify admin authorization and public responses on staging before enabling applications. Rollback: disable community, revert the code changes; leave additive tables in place to preserve applications/audit. Do not drop tables or restore an old shared DB over new student/billing data.

## Transfer validation results (2026-10-06)

- Existing npm run check completed successfully with DB_HOST/DB_USER/DB_NAME and SMTP_HOST blank and AUTO_MIGRATE off. Existing staging/imprint warnings remain; database checks were deliberately offline.
- npm run check:community: 24 passed, 0 failed. Re-run after final layout/body-limit fixes passed.
- Node syntax checks and git diff --check passed.
- Browser verification with synthetic fixtures: public receipt confirmation, request history/review, human approval confirmation, manual handoff and explicit actual-admission confirmation, German locale routing and the shared LangNation header/admin navigation. No real applicant records, WhatsApp operations or messages were involved.
- Desktop layout was inspected. The browser viewport override did not take effect, so a real mobile-device smoke test remains pending.
- No live MySQL migration/smoke test, production startup or deployment was performed.

Pre-transfer copies of every edited existing file are saved at C:/Users/sheik/My_Porject/Portfolio/LangNation-community-transfer/backup. The Portfolio v02 source was preserved. Existing unrelated Lesen/Übung documents were left untouched.

## Scoped database setup command

Run npm run community:setup -- --check first. This loads the existing .env and reads only community table/settings readiness. With DB_USER/DB_NAME empty it stops before connecting.

After selecting the local/staging LangNation database and backing it up, run npm run community:setup -- --apply. It applies only MySQL/38_community.sql and the idempotent INSERT IGNORE initialization, using the requested recommended defaults on a fresh setup and preserving all existing settings. It never starts server.js or runs the other migrations. Remote writes are refused unless --allow-remote is explicitly supplied for the reviewed staging destination. A production rollout remains a separate step.

DDL commits implicitly in MySQL, so a partial schema failure cannot be rolled back as a transaction; fix the error and rerun the guarded setup. The command requires the existing admin_users schema and does not create another database or authentication system.

## Rules & Settings update

The settings page now explains Review → Save, reads settings independently of the groups list, shows refreshed persisted state, and displays configured rules/privacy on the public page even while applications are closed. A failed refresh is reported separately from a successful save. Existing saved text, flags and acceptance versions are preserved. Use recommended defaults to load the supplied rules/privacy, ON availability switches, thresholds 30/60, 180-day review, 20 plain-text phrases and three warning levels into the form; review and explicitly save them. Fresh initialization uses these defaults; INSERT IGNORE never overwrites an existing installation.

Global inheritance and the three promotional toggles are stored inside existing notification_preferences JSON as communityPolicy. No new settings table or settings columns are introduced. MySQL/39_community_policy.sql guardedly adds custom_rules/custom_rules_version to groups and approved_admin_post/admin_post_type to reports. It is an additive migration for the existing boot runner. Group extensions are ignored when global inheritance is selected, extend global rules when custom rules are allowed, and have effective consent versions hashed from global/group policy text versions. Applicants must acknowledge the selected group rules. Existing application consent snapshots are retained.

Only authenticated administrators can verify a report as an approved official announcement/course promotion. Public submissions cannot set that flag; applications cannot claim the exemption. Warning creation and blocking from an exempt report are refused under the current policy. Toggling the promotional policy does not post or send anything to WhatsApp. Patterns increase advisory risk; a pattern by itself cannot produce a rejection recommendation. No automated rejection or permanent blocking is added.

Rules/privacy versions increase on material edits, with updated versions shown in the review summary. Settings, text, thresholds, warning progression and promotional changes have distinct safe audit events without copying notice/applicant text.

Deployment: push, pull/redeploy and restart so migration 39 can run. For an existing installation, open Rules & Settings, use recommended defaults only if desired, review then Save settings. Do not rerun a seed expecting it to overwrite saved values. For a new installation, run the idempotent initialization once. No live database changes are performed by the code update.

WhatsApp Business account connection remains manual. The website does not connect an API number or send messages. A later official Business Platform integration requires Meta app/account/phone setup, authenticated webhooks, opt-in/template policies and a separate cost/eligibility review; no paid integration is included here.

Update verification: full npm run check passed with real database/mail connections disabled; 34 focused tests passed, including six settings/policy regression cases. Browser testing with synthetic data confirmed recommended defaults → review → save → reload, and verified saved text on the public page. No Hostinger session or live database state was inspected.

Changed files for this update: MySQL/39_community_policy.sql, MySQL/community-settings.sql, lib/community/defaults.js, policy.js, settings.js, admin-router.js, public-router.js, applications.js, moderation.js, screening.js, security.js, public/js/app.js, tools/community-setup.js, tools/check-community-setup.js, tools/check-community-settings.js and docs/COMMUNITY.md. No new packages or paid services. The Express/EJS project has no separate TypeScript/lint/bundler build script; Node syntax, EJS and the existing check suite were used. The supplied privacy/rules copy is used as editable administrator content; no live existing configuration was overwritten. Custom rules are extensions to global rules, not replacements for global rules.

## Ready-to-copy approval handoff

The existing authenticated GET /admin/community/api/join-requests/:id/handoff checks approval, active group, anonymization and internal blocks before decrypting an invite. It dynamically generates an approvalMessage from the request first name, that request's group and its private invite. With no invite, it generates the manual-add alternative. Neither messages nor chat URLs are persisted or included in audit metadata.

The existing handoff dialog displays the applicant, international number, group, optional invite, readonly approval message, Copy message, optional Copy invite link, Open WhatsApp and Record actual admission. Copy buttons reuse the site's shared clipboard component, including its plain-HTTP fallback and scoped live status. Open WhatsApp is a user-clicked https://wa.me/<international digits>?text=<encoded message> link with no-referrer/noopener. It opens the applicant chat and pre-fills the message; the administrator reviews and presses Send. No WhatsApp API, automation, external SDK, paid service or automatic message is added.

After approval, the request detail opens and shows Approved — waiting for WhatsApp admission and Open Handoff. Only explicit admission confirmation sets membership ACTIVE. Copying/opening the chat does not change status. Private message/link payloads remain behind existing admin auth, same-origin and no-store protections, never in public API/group/application confirmation. The normal click-to-chat link can contain the private invite in its encoded text; it is only exposed in the protected dialog and opened by the administrator.

No schema or settings changes are required for this handoff update. See the focused handoff tests for dynamic groups, fallback content, encoding, blocked/unapproved access and safe audit metadata.

## Create Group form update

The existing group modal now has Basic Information, Availability, WhatsApp Group Information and Handoff sections, with Create Group/Save Group, Cancel and a disabled loading state during save. New Community / City Groups default ACTIVE, public and accepting applications. Existing groups retain their saved visibility/application flags. Course/batch links remain in the existing intakes module; no new group-type column or duplicate type system was added.

New-group slugs follow the typed name until explicitly edited (lowercase ASCII, accent removal, hyphen separators). Existing slugs never track name edits. Required name/slug/city, optional description/instructions, positive capacity, nonnegative count and existing unique slug constraint are validated server-side. Over-capacity counts give informational warnings and do not reject applications.

The optional private invite is validated as an HTTPS chat.whatsapp.com invitation without contacting WhatsApp. It is encrypted with the existing AES-GCM key and saved in the same transaction as the group. Missing encryption configuration fails before any group write. On edit, a blank field preserves the existing stored invite; an explicit Remove stored private invite control removes it. The existing protected handoff reads/decrypts the exact approved group record; no invite is copied into join requests. Public group serializers and application confirmations stay unchanged. GROUP_CREATED, GROUP_UPDATED, GROUP_ARCHIVED and safe invite-change events never contain the private URL. No database migration or dependency is required.

Combined group/handoff verification: full npm run check passed with live database and SMTP connections disabled; 50 community tests passed (16 new group/handoff cases). Node syntax checks and git diff --check passed. UI behavior was tested with in-process DOM fixtures; no browser/WhatsApp automation or live WhatsApp session was used. Generic membership updates cannot set ACTIVE; use Record actual admission after approval. Files changed: public/js/app.js, lib/community/manual-handoff.js, lib/community/moderation.js, lib/community/validation.js, tools/check-community-handoff.js, tools/check-community-groups.js and docs/COMMUNITY.md. No new schema, package, paid service or authentication system.

## Private invite manager

Private invite now opens a configured/no-invite panel without a visible URL or replacement field. Configured groups show Copy/Open/Show (optional reveal), Replace and Remove. Replace/Add opens a required new-URL form; a blank PUT is rejected, not treated as removal. Remove has its own group-named confirmation and requires DELETE /admin/community/api/groups/:id/invite-link with JSON confirm:true and the existing CSRF token. Blank group edits also preserve existing stored ciphertext.

GET on that same protected invite-link endpoint decrypts the group's existing value only inside authenticated admin routing, with same-origin/no-store headers. GET/PUT/DELETE create safe view/change/remove audit events without the URL. The panel fetches the value into admin-only memory for the actions and reveals visible text only on Show. Open is a normal user-clicked link with noreferrer/noopener. Approved-member handoff continues reading the same encrypted group field. No schema/dependency change or new invitation store.

## Public presentation and Group Details update (2026-10-06)

The public page keeps the shared LangNation header, fonts, theme, buttons and responsive CSS. Compact group cards show uploaded logos or initials, city, optional manual member count and optional parent community. A join action appears only when global applications are enabled and a public group accepts applications; closed groups remain visible with a closed state. Joining opens the existing form for the selected group, with two desktop columns and one mobile column. Confirmation remains a neutral receipt, never approval or an invitation. Reporting is collapsed and omitted when disabled.

Rules summaries are derived from configured rules, with full rules and privacy in accessible native disclosures. The small renderer constructs text nodes, headings and lists for supported Markdown-style content; it never executes raw HTML or loads a new rendering dependency. Existing CSRF, consent snapshots/versions, validation, honeypot and rate limits remain in place.

Group Details now presents human labels and manual-count guidance first; IDs and raw timestamps are collapsed under Technical details. Edit Group supports an optional parent WhatsApp community name. Add/Change/Remove Group Image uses the existing avatar validation and MySQL photo storage pattern. Images are cropped/resized locally, limited to 400 KB decoded, and accept only signature-validated PNG/JPEG/WebP. No SVG, external storage or new paid dependency is added. Image writes require existing admin authorization and CSRF; removal requires explicit confirmation. Public image reads require an active/public group and enabled module. Image bytes and invitation ciphertext are excluded from group JSON; audit metadata contains neither image payloads nor private invitations.

MySQL/40_community_presentation.sql guardedly adds community_name, image, image_type and image_updated_at to community_groups. The scoped setup command now applies 38, 39 and 40 before the idempotent settings initialization. Deploy through the established pull/redeploy/restart process so the existing migration runner applies 40 when AUTO_MIGRATE is enabled. Existing rows and settings are preserved. Parent names/counts/images remain manually maintained; no WhatsApp synchronization or account connection is introduced.

Validation: 64 community tests passed, plus the full existing npm run check with live database/mail disabled. Node syntax and diff whitespace checks passed. Synthetic localhost browser checks verified desktop cards, selected-group submission and receipt, the 390px single-column form with no horizontal overflow, friendly admin details and actual image upload/save. No live MySQL migration, Hostinger restart or production browser verification was performed. The Express/EJS project has no separate TypeScript/lint/bundler build command.

Files: MySQL/40_community_presentation.sql; lib/community/group-image.js, admin-router.js, public-router.js, repository.js, moderation.js; server.js; views/pages/community.ejs; public/js/app.js; public/css/site.css; tools/community-setup.js, check-community-setup.js, check-community-http.js, check-community-groups.js, check-community-image.js, check-community-public-presentation.js, community-ui-dom-fixture.js; docs/COMMUNITY.md.

Group image picker compatibility: explicit .jpg/.jpeg/.png/.webp extensions replace MIME-only accept filters so Windows can show all supported file extensions together. Raster MIME/signature validation and upload limits remain unchanged.

Public card-grid refinement: three desktop columns, two tablet columns and one mobile column; existing Germany artwork reused in the hero. Rules and privacy now start closed and reveal the complete configured content in bordered panels. Join/report forms remain hidden until their CTA is clicked. Country-code selection reuses content/countries.json and suggests a country from the browser time zone/region with Germany as fallback. This is an editable coarse suggestion, not GPS/IP geolocation. National numbers are combined with the selected dial code; explicit +/00 international numbers are preserved. No location service, tracking request or database change.

Consent popups reuse the existing terms-scroll styles and native dialog: long notices scroll, I accept becomes enabled at the end, Decline/Close/Escape never accept, and the selected group's extra rules are included. Acceptance is stored only with successful submission. Existing rules/privacy versions and server timestamps are retained; additive migration 41 adds exact server-selected rules/privacy text snapshots so later edits do not change new requests' evidence. Protected request details display an acceptance record and expandable original notices. Historical requests are not backfilled with current text. No IP/GPS tracking is introduced and audit metadata excludes notice copies.

Final verification for these refinements: 66 community tests pass, including national/international dial-code handling and saved server notice snapshots. Browser checks confirmed closed initial policies/forms, selected group, 238 country choices, scroll-to-end enabling I accept and checking only the matching consent. Existing public response privacy protections are retained.

Policy/card placement update: helpful introduction → compact Rules/Privacy popup launchers → dynamic groups → reporting. Read-only public policy popups do not accept on behalf of an applicant; form-linked consent popups retain scroll-to-accept and saved submission evidence. Cards reuse the existing stored image as cover and avatar, with an image-free fallback; no invented member portraits, topic tags or third-party stock requests. SVG masks provide rule, privacy, location and WhatsApp indicators. No schema change for this layout.

## Group-specific public application links

GET /community/join/:slug (and the existing German locale /de/community/join/:slug) uses the existing Community EJS page, CSRF token and form. The new public-join-link helper validates the slug and performs a parameterized lookup restricted to ACTIVE/public groups, selecting only id/name/slug/application availability. Invalid, missing, inactive or private groups fall through to the normal 404. Public groups whose applications or global applications are disabled show a closed notice and do not automatically open a form. The browser rechecks current public config/groups before opening the exact group's existing form, banner, scroll and focus. Existing group-card actions still select that exact group. Submission stays on POST /api/community/join-requests, preserving screening, consent, rate limiting and pending admission.

Group Details has Public Join Link with Copy link and Open public page, generated from configured SITE_ORIGIN and the existing encoded slug. Existing shared clipboard feedback is reused. This public URL is distinct from Private Invite; no invitation ciphertext/URL, handoff instructions, notes or risk fields are selected or returned by slug lookup. No additional table, copied invitation, paid service or migration is needed. Keep existing slugs unchanged to keep shared URLs stable. The Groups table stays compact; copy is available in Group Details.

Verification: 71 community tests and the full existing npm run check passed with live DB/SMTP disabled. Tests cover valid/invalid/private/inactive lookups, closed group/global availability, target opening/preselection/focus, public allowlists and existing submission protection. Synthetic localhost browser checks confirmed direct-link submission/receipt, the 390px layout without horizontal overflow and Copy link feedback. Hostinger/live MySQL deployment was not performed.

Files: lib/community/public-join-link.js; routes/pages.js; views/pages/community.ejs; views/pages/admin-community.ejs; public/js/app.js; public/css/site.css; tools/check-community-join-links.js; tools/check-community-public-presentation.js; tools/community-ui-dom-fixture.js; docs/COMMUNITY.md.

## Predefined handoff methods

Create/Edit Group now uses Handoff method: Standard – Send private invite link, Manual – Admin adds member, or Custom instructions. The custom textarea appears and is required only for Custom. New Community/City Groups default to Standard; creation or explicit selection of Standard requires a configured encrypted invite (one can be supplied in the same create request). Both predefined methods use central server-side instruction templates. Group Details and approved-member handoff display the interpreted method.

The existing invite_delivery_mode VARCHAR(24) is reused with STANDARD/MANUAL/CUSTOM application choices. No new enum column, table or migration is added. Old rows are not rewritten: non-template instructions resolve to Custom, exact templates resolve to their method, and legacy empty MANUAL rows resolve to Standard with an invite or Manual without one. The old MANUAL label meant the human workflow, not necessarily manual addition. Existing custom text remains intact until an admin explicitly saves a changed configuration; unrelated edits do not rewrite it. New/saved predefined choices persist their template in the existing instructions field; custom choices persist the supplied text there.

Standard handoff decrypts the stored invite and generates the existing link message/actions; missing invite reports a configuration error rather than pretending a link was sent. Manual handoff never decrypts or returns the stored invite, uses the manual-add approval message, and retains Copy message/Open WhatsApp/Record actual admission. Custom shows private admin instructions and retains appropriate existing link/message/admission actions. All flows remain manual and require explicit actual-admission confirmation for ACTIVE membership. No message or WhatsApp member addition is automated; public serializers remain invitation/instruction-free.

Validation: 75 community tests and full npm run check passed with real DB/SMTP disabled. Tests cover new defaults, required Standard invite, optional Manual invite, conditional Custom field, preserved legacy instructions, duplicate rollback, Manual with no encryption key and missing Standard invite. Local synthetic browser verification confirmed default dropdown and Custom-only textarea. No live DB or Hostinger deployment was performed.

Files: lib/community/handoff-method.js, lib/community/moderation.js, lib/community/manual-handoff.js, lib/community/repository.js, public/js/app.js, tools/check-community-groups.js, tools/check-community-handoff.js, docs/COMMUNITY.md.

Cover-only correction: public group cards resolve a separate coverImageUrl from local static files. Priority is covers/groups/<group-slug> then covers/cities/<normalized-city>, then covers/default.webp; WebP/JPG/JPEG/PNG are supported. Place files under public/img/community/covers and see its README.md for adding cities/custom overrides and source credits. No new database field/upload form or external runtime request. Existing uploaded circular logos, data, card dimensions/layout, join actions and admission flow are unchanged. Only the profile-overlap badge gets the filled WhatsApp glyph; its size/position remain unchanged.
Cover correction validation: 77 community tests and the full project check passed with live DB/SMTP disabled. Local browser verified city cover loading, the same existing circular-logo URL and unchanged 170px cover heights. No Hostinger deployment or uploaded group-image changes were performed.
