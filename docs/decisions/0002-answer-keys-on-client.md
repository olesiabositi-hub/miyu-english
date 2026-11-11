# 0002 — Answer keys are technically available on the client (MVP)

Date: 2026-11-11 · Decided by: product owner

- The site is static (GitHub Pages), so auto-checking happens in the browser.
- Mitigation: keys are shipped as salted SHA-256 hashes (`build/lessons-plugin.ts`); `tutorRules` and `quality.notes` are stripped. This stops casual reading of keys, not a determined user (choice keys can be brute-forced from options).
- Conflicts with the contract rule “never send correct answers to learners before submission” — accepted for MVP. Full protection requires a server-side check (later stage, together with the AI tutor backend).
