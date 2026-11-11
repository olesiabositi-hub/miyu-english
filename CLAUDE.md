# Rules for Claude Code in this repo

- Methodology and lesson content belong to the curriculum team (Codex) and the owner. Do not edit `content/lessons/*.json`, answer keys, rubrics, outcomes or tutor rules. Propose changes in `docs/lesson-renderer.md` §8 instead.
- `schemas/lesson.schema.json` is a shared, versioned contract. Change it only with a version bump agreed on both sides; update `src/lib/contract.ts` in the same PR.
- Never ship plain answer keys, `tutorRules` or `quality.notes` to the browser — all lesson data goes through `build/lessons-plugin.ts`.
- Never publish a lesson unless status is approved/published and every quality flag is true.
- Do not invent audio or assets; missing media shows the “being prepared” placeholder.
- Design system: `src/themes/grand-academy.css` (The Grand Academy, MIYU English). Components use tokens only; a new course theme is a new file in `src/themes/`. Cormorant Garamond + Inter; atmosphere only in hero/transitions; study surfaces stay light.
- Multi-course platform (decision 0004): nothing in `src/` may assume English. Course-specific values come from `content/courses/<id>/course.json`; views write course-relative links (`#/lessons`). Only MIYU English is built — do not create pages for other languages until the owner asks.
- Data-format changes (lesson contract) are proposed in `docs/contract-proposals.md` and agreed with the AI-agent team before any schema edit.
- Before a PR: `npm test && npm run build`. Work on a branch; `main` deploys to production.
