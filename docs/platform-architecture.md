# MIYU Language Academy — platform architecture

The site is built as a **multi-course platform**. The first and only course implemented today is
**MIYU English · B2 → C1 · 90 lessons**. Greek A0 → A2, Danish and other courses are *planned*:
nothing course-specific for them exists yet, but adding one is mostly configuration + content.

## 1. Layers

```
content/site.json                         which courses are live, which is default
content/courses/<id>/course.json          one course: language, levels, lesson count, programme, theme,
                                          matching rules, special characters, feature flags, contract
<course.contract.lessonsDir>/D###.json    lesson files, produced by the AI agent (Codex)
schemas/course.schema.json                validates course.json
schemas/lesson.schema.json                lesson contract v1.0.0 (shared with the AI-agent team)
        │
build/lessons-plugin.ts   per course: read config → read lessons → adapter by schemaVersion → publish gate
build/adapters/v1.ts      contract v1.0.0 → internal PublicLesson (keys hashed, tutor rules stripped)
        │  virtual:miyu-courses  { site, courses: [{ config, lessons, demo }] }
        ▼
src/lib/course.ts         active course registry (config, lessons, links)
src/lib/progress.ts       per-course progress store
src/lib/answer-key.ts     language-aware answer normalisation + hashing
src/lib/lesson-model.ts   lesson → steps (course-agnostic)
src/app/*                 shell, router, views, universal lesson renderer
src/themes/<theme>.css    course visual themes (tokens only) + scripts.css (script fallbacks)
```

## 2. What a course can define (course.json)

| Field | Used for |
|---|---|
| `id` | URL (`#/<id>/…`), progress namespace, key-hash salt |
| `title`, `tagline` | page titles, profile, headers |
| `targetLanguage { code, name, script, dir }` | `lang`/`dir` on every piece of learning content and answer field, script font fallbacks, locale-aware answer matching |
| `uiLanguage`, `explanationLanguages` | `<html lang>`; future “Explain in …” tutor action |
| `levels { from, to, scale, framework }` | level labels (“B2 → C1”, “A0 → A2”), validator checks lesson `level` |
| `totalLessons` | “Lesson 18 of 90”, course progress %, validator checks `sequence` |
| `modules[]` | My Lessons, journey map, landing curriculum explorer |
| `theme` | `data-theme` + web fonts (`src/themes/index.ts`) |
| `answerMatching { caseSensitive, ignoreDiacritics, ignoreTrailingPunctuation }` | auto-check normalisation (applied identically at build and in the browser) |
| `input.specialCharacters` | on-screen keys above text answers (e.g. `æ ø å`, Greek accented vowels) |
| `features` | `available` / `planned` / `off` for diagnostic, Speaking Studio, Daily 15, tutor |
| `contract { version, schema, lessonsDir, assetsDir, lessonIdPattern }` | which lesson contract and where its files live |

## 3. Universal lesson components

The renderer never branches on a course. It reads the internal lesson model and course config:

- **Sections**: text (safe Markdown subset), images, audio with speed control, transcript gating, evidence highlighting.
- **Tasks**: 9 response types × 4 scoring modes, dependencies, reveal after attempts (see `docs/lesson-renderer.md`).
- **Languages & scripts**: every content node and answer field gets the course `lang`/`dir`; Unicode NFKC + locale lower-casing (e.g. Greek final sigma); optional accent folding; special-character keys; `:lang()` font fallbacks; logical `dir` for future RTL courses.
- **Audio & pronunciation**: section audio (any of mp3/m4a/ogg/opus/wav/webm); microphone recording kept on device with text alternative; for speaking tasks whose section has approved audio, a “listen to the model, then record and compare” player. Missing audio → “being prepared”, never invented.

## 4. Progress

`localStorage["miyu:<courseId>:progress:v1"]` — one independent store per course (answers, drafts,
visited steps, review queue, Daily 15 log, diagnostic state). `localStorage["miyu:profile:v1"]` — shared
profile (first name). Reset and export act on the active course. Data saved by the first single-course
build (`miyu-english:v2`) is migrated automatically.

## 5. Routing

Learner app: `/learn/#/<courseId>/<view>/…`. Views write course-relative links (`#/lessons`); the shell
scopes them. Unknown or missing course ids redirect to `site.defaultCourse`. The public landing page
`/` is the English course’s marketing page and reads `content/courses/english/course.json`.

## 6. Adding a course later (checklist)

1. **Agree the data format** with the AI-agent team (see `docs/contract-proposals.md`). If the course uses a new contract version: add its schema file and an adapter in `build/adapters/`, register it in `ADAPTERS`.
2. Create `content/courses/<id>/course.json` (validated by `schemas/course.schema.json`).
3. Optional new theme: `src/themes/<theme>.css` + entry in `src/themes/index.ts`.
4. Add `<id>` to `content/site.json → courses`.
5. Lessons arrive in the course’s `lessonsDir`; CI validates them per course.
6. Only then: course-specific marketing page and UI translations, if the course needs them.

## 7. Known limits (honest list)

- **Interface language**: the learner-app chrome is written in English. A course with a non-English interface needs string extraction into `src/i18n/` — planned for when such a course is approved; content language is already independent.
- **Landing page** is English-only by design; a platform home page (course chooser) is not built.
- **Contract v1.0.0 is English-specific** (`language: "en"`, levels B2–C1, max 90 lessons, exactly 8 chunks). Other courses need the agreed changes in `docs/contract-proposals.md` before content can be produced.
- **Fonts**: Cormorant Garamond has no Greek glyphs; Greek content falls back to Noto Serif/Inter via `themes/scripts.css`. A Greek course should get its own theme decision.
