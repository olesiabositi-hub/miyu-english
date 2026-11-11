# MIYU English — Codex ↔ Claude Code integration contract

Version: 1.0 (proposed; freeze after D001 integration test)

## Core principle
Codex produces pedagogical content as JSON. Claude Code builds the site and the reusable lesson renderer. The production site reads validated content files; Claude does NOT need a separate chat message for each lesson.

## Repository convention
- `schemas/lesson.schema.json` — shared JSON Schema (copy from this package).
- `content/lessons/D001.json` ... `D090.json` — one lesson per file.
- `public/assets/lessons/D001/` — audio, imagery and other approved assets, if the site architecture uses public assets.
- `src/` — site code, components and styling (Claude Code owns).
- `scripts/validate-lessons.*` — automated schema + editorial checks (Codex and Claude agree on implementation).

## Ownership
- **Codex**: content, tasks, answer keys, evidence, CEFR-linked learning outcomes and QA metadata; modifies `content/` and content-validation scripts.
- **Claude Code**: designs the site and components, consumes the schema, renders exercises, progress and accessibility; modifies `src/` and asset delivery wiring.
- **Human owner**: approves curriculum, final editorial quality, and publication; controls `status`.

## Content workflow
1. Codex generates `D001.json` in `draft` status, applying the canonical MIYU specifications.
2. Run JSON Schema validation and pedagogical/answer-key checks. Schema validation alone does not establish pedagogical quality.
3. Content editor reviews audio scripts, source-linked comprehension evidence, answer keys, speaking/writing rubrics and task quality.
4. Owner sets `status: approved` after review. CI permits publishing only approved lessons with all QA flags true.
5. Merge changes into the deployment branch; site build reads lesson JSON and displays newly approved material.
6. For later lessons, follow the same automated pipeline. Never deploy unapproved drafts to public lesson routes.

## Important rules
- Treat `Production Specification v2 Aligned` as canonical for lesson requirements; schema is a transport contract, not a replacement for methodology.
- In the methodology, 14 tasks is the MINIMUM, not the maximum; the schema enforces >=14 only.
- The real approved lesson must include source-linked evidence and final answer keys; tasks relying on missing text/audio must not be published.
- `assetRefs` are project-relative file paths or URIs, chosen consistently by engineering; do not invent audio asset availability.
- A JSON schema verifies structure and types, NOT uniqueness of all task IDs, rubric accuracy, content length, audio length, evidence references or CEFR alignment. Implement extra cross-field/pedagogical checks in CI.
- AI-tutor adaptation must use reviewed prompts and controlled access to answer keys; never send correct answers to learners before submission.
- Changes to schema require versioning and updates to both producer and renderer.

## First joint integration test
Codex: produce one real `content/lessons/D001.json`, grounded in finalized lesson materials, and a validation script. Claude Code: build a prototype lesson page consuming that exact file, with reading, exercise, feedback and a safe placeholder for unavailable audio. Confirm both work locally before scaling to D002–D090.
