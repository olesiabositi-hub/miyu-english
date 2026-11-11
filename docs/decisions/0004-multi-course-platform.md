# 0004 — The site is a multi-course platform (MIYU Language Academy)

Date: 2026-11-11 · Decided by: product owner

- English B2 → C1 (90 lessons) launches first. Greek A0 → A2, Danish and others will follow.
- Courses are independent: own programme, lesson count, levels, exercises, theme, progress.
- A new course is added mainly through `content/courses/<id>/course.json` + content (+ optional theme / contract adapter). See `docs/platform-architecture.md`.
- Only the English course is built now. No Greek or Danish pages.
- The Integration Contract v1.0.0 remains the base; any data-format change is agreed with the AI-agent team first (`docs/contract-proposals.md`).
- MIYU English keeps the approved “The Grand Academy” visual theme.
