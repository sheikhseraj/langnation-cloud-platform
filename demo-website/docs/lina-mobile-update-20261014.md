# Lina mobile update — 14 October 2026

The read-only reference was D:/Project_All/LangNation Dictionary/Web/langnation-dictionary-v25. Its public/lina.js, public/lina.css, public/lina-actions.js and Lina API/learning modules were inspected. The three public reference files retained identical SHA-256 hashes after implementation. All edits are in the Website repository.

## Result

- A compact Ask Lina / Lina fragen portrait launcher replaces the separate automatic greeting balloon. The welcome line and course label are shorter; secondary tile descriptions are hidden on mobile.
- The mobile panel is at most 410 pixels / 60dvh and fits within the visual viewport and safe-area insets. Messages scroll while the composer and controls remain visible. Desktop keeps a 350 × 520 panel.
- Mouse/touch pointer dragging moves the closed launcher smoothly, stays within the visible bounds and remembers its position locally. Releasing a drag does not open the chat. Alt + arrow keys provide keyboard movement. The open panel uses the safe lower corner; minimising returns to the saved spot.
- Focusing a page input, textarea or contenteditable field minimises chat without stealing focus. Lina becomes a small portrait and moves clear of the focused field. It temporarily hides when a full-screen editor leaves no free space. Scrolling, rotation, resizing, fonts and visual-viewport changes trigger a bounds check.
- A delayed answer cannot take focus back from a page field. Closing clears the draft and conversation and ignores pending replies from the closed conversation. Minimise retains the conversation.
- Existing Website chat facts, providers, language handling, links and follow-up actions continue through the existing /chat API. Only launcher position is persisted by the new controller.

## Verification

- Full npm run check passed, including 10 new position/gesture/focus tests, 96 existing chatbot checks and 269 rendered-page checks.
- Browser QA used the real Website UI and harmless local mock replies. Tested 320, 375, 390, 414 and 1024 pixel widths plus a 390 × 360 short viewport. The composer remained visible; mobile descriptions were hidden and the compact action grid fit at 320 pixels.
- Actual browser dragging, saved-position restoration after reload, keyboard movement, page-field minimising, reply focus protection, and closing during a pending reply were exercised. English and German labels/welcome lines were inspected. No browser console errors were observed.
- Visual-viewport keyboard reduction and offsets, multitouch/cancellation, unavailable storage and full-screen field avoidance have isolated regression coverage. Physical iPhone/Android keyboards were not available for a real-device test.

No production messages, emails or account changes were submitted during this implementation. Screenshots and complete check logs are saved in the task artifact directory.
