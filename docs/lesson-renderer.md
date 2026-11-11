# Universal lesson renderer — architecture

Status: implemented against **MIYU English Lesson Contract v1.0.0** (`schemas/lesson.schema.json`, copied verbatim from the integration package).
Owner: Claude Code (site). Content owner: Codex. Methodology owner: the product owner.

The renderer does not interpret or change the methodology. It shows what the lesson file contains,
in the order the file gives, and only adds navigation, feedback states and progress.

## 1. Data flow

```
content/courses/english/course.json   course config (levels, 90 lessons, theme, matching rules…)
content/lessons/D0NN.json             (Codex, status draft → review → approved/published)
        │
        ├─ scripts/validate-lessons.mjs   schema + cross-field checks (CI, every push)
        │
        ├─ build/lessons-plugin.ts        build time, Node, per course; adapter by schemaVersion (build/adapters/v1.ts)
        │     • publishing gate: status approved|published AND all quality flags true
        │       (dev server / MIYU_PREVIEW_DRAFTS=1 also includes drafts, marked “Preview”)
        │     • answer keys  → salted SHA-256 hashes (keyHashes); plain keys never reach the browser
        │     • tutorRules, quality.notes → removed
        │     • assetRefs → resolved against public/; missing files are counted, never invented
        │
        └─ virtual:miyu-courses           { site, courses: [{ config, lessons, demo }] }
                │
                ├─ src/lib/lesson-model.ts   view-model: steps
                ├─ src/lib/scoring.ts        evaluation by scoring.mode
                ├─ src/lib/course.ts         active course (config, lessons, links)
                ├─ src/lib/progress.ts       localStorage per course (decision 0001)
                └─ src/app/lesson.ts         workspace UI
                     ├─ lesson/sections.ts   section renderer (text, listening, transcript, evidence)
                     ├─ lesson/tasks.ts      task card + one input per responseType
                     ├─ open-response.ts     long text / speaking (mic stays on device) / reflection
                     └─ tutor.ts             MIYU Tutor drawer (UI only until the tutor is connected)
```

## 2. From lesson JSON to learner steps

`buildSteps(lesson)` (pure function, unit-tested):

| Step | Source | Notes |
|---|---|---|
| Overview | `title`, `level`, `durationMinutes`, `outcomes`, `grammar`, module title from `content/courses/english/course.json` | Always first |
| One step per section | `sections[i]` in file order | Step title = `section.title`, eyebrow = section type label |
| …its tasks | every task whose `sectionId` = that section, in `tasks[]` order | A task is shown exactly once |
| Further practice | tasks with no / unknown `sectionId` | Only if such tasks exist |
| Wrap-up | `lexicalChunks` (8), `review.retrievalPrompts`, `review.delayedTransfer` | Finishing the lesson adds chunks + prompts to Review Lab |

Platform context: see `docs/platform-architecture.md`. Nothing in this renderer is English-specific.

Learners can move between steps freely (any pace, lessons can be split across days). A lesson is
**complete** when every task is finished (see §4) and the learner presses *Finish lesson*.

## 3. Sections

| `section.type` | Rendering |
|---|---|
| all types | `content` as safe Markdown subset (§7), images from `assetRefs` |
| `listening` (or any section with audio) | `<audio>` with speed 0.75–1.25× and “back 5 s”; **missing audio → “Audio is being prepared” placeholder** + transcript |
| `transcript` | Hidden behind *Show transcript*; unlocked after first play or first answer in that section (always available when audio is missing) |
| `evidenceSpans` | After a task with `scoring.evidenceSpanIds` is answered, *Show where this is in the text/transcript* highlights the span (`<mark class="evidence">`). Spans with `startSeconds` can drive “play this part” once audio exists |

## 4. Tasks — one card, nine inputs

Every task renders as the same card: `Task N · input kind · scoring label · Ask MIYU Tutor`.

| `responseType` | Input | Auto-check canonical form |
|---|---|---|
| `single_choice` | radio cards A/B/C | option id; any of `correctOptionIds` |
| `multiple_choice` | checkbox cards | sorted ids — exact set |
| `ordering` | list with ↑/↓ buttons (keyboard-accessible); start order is a stable shuffle, never the stored order | ids in learner order — exact sequence |
| `short_text` | text input | normalised text; any of `acceptedAnswers` |
| `gap_fill` | inline inputs replacing each `___` (3+ underscores) in `prompt` | normalised parts joined by ` \| ` |
| `matching` | **fallback**: items listed, learner marks done (formative) | none — see open question Q2 |
| `long_text` | textarea, word count, draft autosave | never auto-scored |
| `audio_recording` | microphone (consent text, stop, replay, retry, error) + **Type instead** | never auto-scored; audio stays on device |
| `self_reflection` | textarea | never auto-scored |

Normalisation (identical at build and in the browser, rules from `course.json → answerMatching`): Unicode NFKC, curly → straight quotes, dashes, collapse spaces; locale-aware lower case (unless `caseSensitive`); optional accent folding (`ignoreDiacritics`); trim trailing punctuation. Key hashes are salted with course id + lesson id + task id.

### Scoring modes

| `scoring.mode` | Status after submit | Learner sees |
|---|---|---|
| `auto` | `correct` / `incorrect` | Correct + `feedback`. Wrong: “Not quite — try again” (feedback held back until the 2nd attempt because it usually explains the key). After 2 misses on choice/ordering: *Show the answer* (derived locally from hashes) |
| `rubric` | `submitted` | “Submitted” + the `rubric` text as self-check criteria. Score left empty for a future tutor/teacher |
| `manual` | `pending_review` | “Submitted for review — you can keep going” + rubric. No reviewer workflow exists yet |
| `formative` | `done` | “Done” + feedback |

A task is **finished** when: correct, or submitted/pending/done, or two honest attempts, or the answer was revealed.

### Dependencies
`dependencies[]` may list task ids or section ids. The card stays locked (“Complete Task 9 first”) until each
task dependency is finished / each section was visited. Cycles are rejected by the validator.

## 5. Progress & review (browser only)

`localStorage` key `miyu:<courseId>:progress:v1` (one store per course): per lesson → visited steps, current step, answers
(`response`, `status`, `score`, `attempts`, `firstStatus`), text drafts. Saved after every answer and
while typing. Demo progress is stored under `demo:*` and never counts toward course progress.
Skills profile (My Progress) uses only real attempts: first-attempt accuracy for auto tasks, count of
submissions for others. It never claims a CEFR level.

## 6. MIYU Tutor

Drawer on every learner screen; on the lesson it knows the lesson, step, focused task and selected text.
`tutorRules` are **not** shipped to the browser — they belong to the future tutor backend together with
controlled key access. Until that backend exists, quick actions explain what they will do (“In development”).

## 7. Conventions we propose to Codex (not in the schema)

1. **`content` / `transcript` format** — plain text with a small Markdown subset: blank line = paragraph, `- ` list, `## ` heading, `**bold**`, `*italic*`. No HTML.
2. **gap_fill blanks** — mark each blank with `___` (3+ underscores) in `prompt`. For N blanks, each accepted answer lists the parts separated by `|`, e.g. `"to|meeting"`. The validator enforces the count.
3. **assetRefs** — paths relative to `public/`, e.g. `assets/lessons/D001/listening-1.mp3`; absolute `https://` URIs also work. Missing files are a warning for drafts and an **error** for approved lessons.
4. **evidence spans** — `text` must appear verbatim in the section’s `content` or `transcript` (Markdown markers ignored). Validator enforces it.
5. **ordering** — `correctOptionIds` lists every option id in the correct order.

## 8. Open questions for the contract (v1.1 candidates)

Multi-language proposals (Greek, Danish…) are collected in `docs/contract-proposals.md`.

| # | Question | Current behaviour |
|---|---|---|
| Q1 | The design brief lists methodological stages (Surprise Recall, Discover, Language Lab, Practice, Think in English, Real-Life Challenge, Wrap-up). The schema has no stage field. Should `section.title` carry the stage, or do we add `section.stage`? | Rail shows `section.title` in file order |
| Q2 | `matching` has no key structure (pairs). Proposal: `options` with `group: "left"\|"right"` and `scoring.correctPairs: [["a","1"],…]` | Rendered as formative self-check; validator rejects `auto` matching |
| Q3 | Partial credit for `multiple_choice` / multi-gap (`maxPoints` > 1)? | All-or-nothing |
| Q4 | `feedback` is one string shown after submission. Do we want `feedback.correct` / `feedback.incorrect` / `hint` separately? | Shown after a correct answer or the 2nd attempt |
| Q5 | Image alt text — `assetRefs` cannot carry it. | Images treated as decorative (`alt=""`) |
| Q6 | Module index (13 modules, days, skills, lesson list) — which file does Codex own? | `content/courses/english/course.json → modules` (site-owned titles from the brief, lessons empty) |
| Q7 | The contract says keys must never reach learners before submission. A static site cannot fully hide them. | Owner accepted for MVP (decision 0002); keys are hashed, `tutorRules` removed. Real protection needs a server check |

## 9. Adding lessons D002–D090

No site change is needed: Codex adds `content/lessons/D0NN.json`, CI validates, owner sets `status`
and QA flags, merge to `main` → GitHub Pages rebuilds and the lesson appears in My Lessons and Home.
