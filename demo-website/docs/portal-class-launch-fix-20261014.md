# Portal class launch and separate tabs — 14 October 2026

## Findings

- On the deployed student demo dashboard, clicking the Join POST button left the visible page unchanged. The user reports the failure in both the website browser and the mobile app. Production request logs were not available, so the precise live server/native failure is unconfirmed.
- The previous fix deliberately removed separate-tab navigation. The user now requires Join/Start, materials, WhatsApp, exercises and Aufgaben to open separately.
- The attendance helpers rejected a missing default batch URL before considering a valid lesson-specific URL. This is a reproducible code defect, now covered by a regression test.

## Implementation

- Join/Start are native links with target=_blank and rel=noopener noreferrer. Opening the room no longer depends on a successful attendance write or POST redirect.
- A separate same-origin POST records attendance/class start, retains authentication and CSRF checks, and returns JSON without redirecting the tracking request. A failure shows a notice in the original portal and leaves the room link usable.
- Authorized course/batch reads resolve today's first uncancelled lesson override before the default room. Invalid room URLs are not offered. Existing stable IDs and ownership queries remain intact.
- Student/teacher course resources and schedule meeting links open separately. Student Aufgaben navigation and exercise launch links also open in new tabs. General portal navigation keeps its existing behavior.
- A valid lesson room works even when the batch default is empty. Teacher-entered attendance marks still take priority over automatic marks.

## Verification

- Full npm run check passed, including 19 isolated portal-flow tests, 390 teacher checks and 269 page-render checks. Render checks enforce new-tab resource links, direct meeting URLs and CSRF tracking tokens.
- At a 390 × 600 CSS viewport, clicks opened separate browser tabs for student Join, teacher Start, materials, chat, exercises and Aufgaben. The original portal stayed open. All external destinations in this test were harmless local mock pages, with in-memory data only.
- The live demo was inspected, but no real conference was joined, no permissions for camera/microphone were accepted, and no production financial data was changed during this fix.
- The native iPhone app was not available for a device test. Its separate-window handling and the deployed conference destination must be retested after deployment. This Website repository contains no native app source.

The change requires deployment of the updated Website code. A GitHub push alone does not prove the production site or submitted app has updated.
