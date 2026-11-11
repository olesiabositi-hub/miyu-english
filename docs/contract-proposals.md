# Lesson contract — proposals for the AI-agent team

Status: **proposals only — nothing here is applied.** Contract v1.0.0 stays the format for MIYU English.
The site already supports several contract versions side by side (adapter per `schemaVersion`), so
English lessons do not need to change when a later version is agreed.

## A. Needed for other languages (multi-course)

| # | Today (v1.0.0) | Problem for Greek A0→A2 / Danish | Proposal |
|---|---|---|---|
| A1 | `language: const "en"` | blocks every other language | BCP 47 string; must equal `course.json → targetLanguage.code` |
| A2 | `level: enum B2, B2+, C1` | Greek starts at A0 | string, validated against the course’s `levels.scale` |
| A3 | `sequence: max 90` | course sizes differ | max from `course.json → totalLessons` |
| A4 | `lexicalChunks: exactly 8`, `tasks: min 14` | methodology of an A0 course may differ | per-course limits in the course methodology / course.json, schema keeps min 1 |
| A5 | path `content/lessons/D###.json` | ids clash between courses | `content/courses/<courseId>/lessons/D###.json`, assets in `public/assets/courses/<courseId>/lessons/D###/`. English can move with one script when convenient |
| A6 | no course id in the file | files are identified only by folder | optional `courseId`, checked against the folder |
| A7 | no transliteration | Greek A0 learners need romanisation / stress marks | optional `transliteration` on sections, options and chunks; optional `ipa` |
| A8 | no task-level media | pronunciation needs a model recording per item | optional `task.assetRefs` (model audio), `task.targetText` (what to say) |
| A9 | explanation language implied (Russian) | other courses may explain in other languages | `course.json → explanationLanguages` (site side, done) — tutor prompts per course |

## B. Open questions already raised for v1 (English)

| # | Question |
|---|---|
| B1 | Methodological stages (Surprise Recall … Wrap-up): add `section.stage`, or keep them in `section.title`? |
| B2 | `matching` has no key structure: `options[].group` + `scoring.correctPairs`? |
| B3 | Partial credit for multi-answer tasks? |
| B4 | Separate `feedback.correct` / `feedback.incorrect` / `hint`? |
| B5 | Alt text for images in `assetRefs`. |
| B6 | Who owns the module index (days, skills, lesson list per module)? |
| B7 | Answer keys on a static site — server-side check later? |

## C. Conventions the D001 pilot relies on (site-side today — please confirm or replace with fields)

| # | What D001 needed | How the site handles it now | Proposed field |
|---|---|---|---|
| C1 | T01/T03: choice **and** a written justification (rubric mode) | any `single/multiple_choice` with `scoring.mode ≠ auto` shows a justification box; choice checked, reasoning self-checked | `task.requiresJustification: true` |
| C2 | T09 matching key | `acceptedAnswers` as `"1-C"` pairs; items read from the prompt (`1 ‘what drives me’`) | `task.matchItems: [{id,text}]`, `scoring.correctPairs` |
| C3 | T10 gaps: one accepted answer per blank | if `acceptedAnswers.length` = number of `___`, answers are per blank | `scoring.blankAnswers: [[…],[…]]` |
| C4 | T12/T13 timing and segments | `content/courses/english/lesson-ui/D001.json` (copied from prompts) | `task.timing {startWithinSeconds,minSeconds,maxSeconds}`, `task.segments[]` |
| C5 | T12 unseen follow-up questions live in `tutorRules` | extracted at build from “Choose one: … \| …” | `task.followUpQuestions[]` (learner-visible on demand) |
| C6 | Listening script contains production cues `Name [A, stress …]:` | hidden in the learner view | separate `transcript` (learner) and `productionNotes` |
| C7 | rubric short answers: `acceptedAnswers` are model answers, not exact keys | shown after submission as “one possible answer” | `scoring.modelAnswers` |

## Suggested versioning

- **v1.1.0** — only optional additions (A6, A7, A8, B1, B2, B4, B5). English v1.0.0 files stay valid.
- **v2.0.0** — relaxations that change validation (A1–A5). Needed before the first non-English lesson.
- The site will add `build/adapters/v1_1.ts` / `v2.ts`; the renderer components stay the same.
