# Acceptance Checklist

## A. Repository / architecture

- [ ] Existing Student Portal auth reused.
- [ ] Existing enrollment/entitlement logic reused.
- [ ] Existing Dictionary search/business logic reused.
- [ ] No complete Dictionary dataset copied to `langnation.com`.
- [ ] No iframe used for the Dictionary UI.
- [ ] No unrelated page redesign.

## B. Reading lesson

- [ ] A1 `Die Farben` pilot is visible to an entitled student.
- [ ] Lesson content renders correctly on desktop.
- [ ] Lesson content renders correctly on mobile.
- [ ] Reading is usable even when Dictionary service is unavailable.
- [ ] Lesson is data-driven, not hardcoded into one UI component.

## C. Text selection and Dictionary

- [ ] Desktop text selection produces contextual actions.
- [ ] Mobile supports usable word tap and/or long-press selection flow.
- [ ] Empty selection does nothing.
- [ ] Surrounding punctuation is normalized for single-word lookup.
- [ ] German umlauts and ß are preserved.
- [ ] Lookup calls real Dictionary backend/service.
- [ ] Result shows only fields actually returned by Dictionary.
- [ ] Loading state exists.
- [ ] No-result state exists.
- [ ] Upstream error/timeout state exists.
- [ ] `Open full Dictionary` works.
- [ ] Stale requests are cancelled or ignored.
- [ ] Repeated same-word lookup is cached appropriately.

## D. Dictionary UI

- [ ] Compact panel visually echoes the current Dictionary style.
- [ ] It does not copy the whole Dictionary page into the portal.
- [ ] Long German compound words wrap correctly.
- [ ] Empty data sections are hidden.
- [ ] Audio action only appears/enables when real audio is available.
- [ ] Popup stays within viewport on desktop.
- [ ] Mobile uses a usable drawer/bottom-sheet/modal pattern.

## E. Exercises

- [ ] All five pilot MCQs render.
- [ ] Answer validation is authoritative on server where architecture supports it.
- [ ] Correct feedback works.
- [ ] Incorrect feedback works.
- [ ] Hint works.
- [ ] Retry works.
- [ ] Optional source-text reveal/highlight works if implemented.
- [ ] Attempt count persists.
- [ ] Hint usage persists.
- [ ] Completion requires all required exercises.

## F. Progress

- [ ] Lesson start recorded.
- [ ] Progress updates after each exercise.
- [ ] Refresh does not lose persisted progress.
- [ ] Logout/login does not lose persisted progress.
- [ ] Completion timestamp recorded.
- [ ] Completion state shown in lesson list/dashboard.

## G. Saved vocabulary (if included in MVP)

- [ ] Authenticated user can save a Dictionary entry.
- [ ] Stable Dictionary ID/key is stored.
- [ ] Small snapshot/context can be stored.
- [ ] Duplicate handling is intentional.
- [ ] User cannot read/delete another user's saved words.
- [ ] Full Dictionary can be reopened from saved item.

## H. Security

- [ ] No credentials/secrets in frontend bundle or committed source.
- [ ] No IDOR in lesson/progress/vocabulary routes.
- [ ] DB access uses safe parameterization/ORM.
- [ ] Rich text is sanitized.
- [ ] Stateful requests use existing CSRF/auth protections.
- [ ] Dictionary query length is limited.
- [ ] Rate limit exists where appropriate.
- [ ] CORS is restricted if direct cross-origin browser requests are used.
- [ ] CSP is updated only as needed.

## I. Accessibility

- [ ] Keyboard can activate contextual actions.
- [ ] Escape closes popup/drawer where expected.
- [ ] Focus returns sensibly after close.
- [ ] Interactive icons have accessible names.
- [ ] Exercise feedback is not color-only.
- [ ] Feedback is announced appropriately where the app supports ARIA live regions.

## J. Quality / delivery

- [ ] Formatting passes.
- [ ] Lint passes.
- [ ] Typecheck passes where applicable.
- [ ] Unit/integration tests pass.
- [ ] Production build passes.
- [ ] New environment variables documented.
- [ ] Migrations documented.
- [ ] Deployment order documented if both apps must be released.
- [ ] Rollback notes provided for schema/API changes.

## Reusable template and answer validation

- [ ] `Die Farben` is rendered by the same reusable Lesen renderer used for future lessons.
- [ ] No lesson-specific component/page contains hardcoded `Die Farben` question logic.
- [ ] Every MCQ renders all configured student-selectable options.
- [ ] Every MCQ has at least one valid correct option ID and no dangling option IDs.
- [ ] Fill-blank/short-answer exercises require explicit `acceptedAnswers` before publish.
- [ ] Correctness is deterministic; no AI/runtime semantic guessing is required for MVP.
- [ ] Invalid/incomplete answer keys are rejected or clearly blocked from publication.
- [ ] Feedback, hints and support anchors come from lesson data, not hardcoded components.
