# 0001 — Progress is stored in the browser (stage 1)

Date: 2026-11-11 · Decided by: product owner

- No accounts, no backend at stage 1. Progress, drafts and review queue live in `localStorage`, one store per course (`miyu:<courseId>:progress:v1`, decision 0004).
- Consequence: progress does not sync between devices and is lost if browser data is cleared. Profile → “Download my progress” exports JSON.
- Revisit when registration / diagnostic tracking is decided (needs technical and legal decision: privacy, terms).
