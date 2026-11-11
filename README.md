# MIYU Language Academy — MIYU English

Multi-course language-learning platform. First course: **MIYU English · 90 lessons · B2 → C1** (`english.miyu.academy`, theme “The Grand Academy”). Further courses (Greek A0 → A2, Danish, …) are added through configuration and content — see [`docs/platform-architecture.md`](docs/platform-architecture.md).

| Path | What | Owner |
|---|---|---|
| `schemas/lesson.schema.json` | Lesson contract v1.0.0 (shared, versioned) | Codex + Claude Code |
| `content/lessons/D001.json … D090.json` | Lessons | Codex |
| `content/site.json` | Live courses, default course | owner |
| `content/courses/<id>/course.json` | Course config: language, levels, lesson count, modules, theme, matching rules | site + owner |
| `schemas/course.schema.json` | Course config schema | Claude Code |
| `build/adapters/` | Lesson contract → internal model, one per contract version | Claude Code |
| `src/themes/` | Course visual themes | Claude Code |
| `scripts/validate-lessons.mjs` | Schema + cross-field checks | shared |
| `src/`, `build/`, `index.html`, `learn/` | Site, learner app, lesson renderer | Claude Code |
| `public/assets/lessons/D0NN/` | Approved lesson media | content → site |
| `tests/` | Unit tests + interface demo fixtures (`tests/fixtures/<courseId>/`) | Claude Code |
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

Platform: [`docs/platform-architecture.md`](docs/platform-architecture.md) · Contract proposals: [`docs/contract-proposals.md`](docs/contract-proposals.md) · Lesson renderer: [`docs/lesson-renderer.md`](docs/lesson-renderer.md) · Contract: [`docs/INTEGRATION_CONTRACT.md`](docs/INTEGRATION_CONTRACT.md) · Decisions: [`docs/decisions/`](docs/decisions/)
