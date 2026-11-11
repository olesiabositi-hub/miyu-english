# 0003 — Hosting: GitHub Pages at english.miyu.academy

Date: 2026-11-11

- Repo `olesiabositi-hub/miyu-english`, deploy by GitHub Actions on push to `main` (`.github/workflows/deploy.yml`): validate → unit tests → build → Pages.
- Custom domain via `public/CNAME` = `english.miyu.academy`; DNS: CNAME `english` → `olesiabositi-hub.github.io`.
- Learner app uses hash routes (`/learn/#/…`) so no server rewrites are needed.
