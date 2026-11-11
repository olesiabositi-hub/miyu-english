# MIYU English — The Grand Academy

Website and learner app for **MIYU English · 90 lessons · B2 → C1** — `english.miyu.academy`.

| Path | What | Owner |
|---|---|---|
| `schemas/lesson.schema.json` | Lesson contract v1.0.0 (shared, versioned) | Codex + Claude Code |
| `content/lessons/D001.json … D090.json` | Lessons | Codex |
| `content/curriculum.json` | 13-module index | site (until Q6 is settled) |
| `scripts/validate-lessons.mjs` | Schema + cross-field checks | shared |
| `src/`, `build/`, `index.html`, `learn/` | Site, learner app, lesson renderer | Claude Code |
| `public/assets/lessons/D0NN/` | Approved lesson media | content → site |
| `tests/` | Unit tests + interface demo fixture | Claude Code |
| `docs/` | Contract, renderer architecture, decisions | shared |

## Commands
```bash
npm ci
npm run dev        # local site, drafts visible as “Preview”
npm run validate   # validate all lesson files
npm test           # validate + unit tests
npm run build      # production build: only approved lessons with all QA flags true
```

## How a lesson goes live
1. Codex adds `content/lessons/D0NN.json` (status `draft`) on a branch → pull request.
2. CI runs validation and tests. Preview locally with `npm run dev`.
3. After editorial review the owner sets `status: approved` and the `quality` flags to `true`.
4. Merge to `main` → GitHub Pages rebuilds → the lesson appears for learners.

Architecture: [`docs/lesson-renderer.md`](docs/lesson-renderer.md) · Contract: [`docs/INTEGRATION_CONTRACT.md`](docs/INTEGRATION_CONTRACT.md) · Decisions: [`docs/decisions/`](docs/decisions/)
