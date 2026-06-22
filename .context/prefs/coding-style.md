# Coding Style Guide

> This file defines the team's coding standards. All LLM tools must follow it when modifying code.
> Committed to Git and shared by the team.

## General

- Prefer small, reviewable changes and avoid unrelated refactoring.
- Keep functions within 50 lines where possible, with nesting no deeper than 4 levels.
- Use clear and direct names; avoid single-letter variables except loop counters.
- Handle errors explicitly; silent error swallowing is forbidden.
- Use immutable updates by default; avoid mutating objects or arrays in place.
- Do not leave debug output in production code; frontend production code must not use `console.log`.

## Backend (Python / FastAPI / SQLAlchemy)

- Follow PEP 8 and add type annotations to all function signatures.
- Keep the router layer lightweight; put heavy logic in `backend/src/services/`.
- Prefer reusing `repositories/` and existing models for data access; do not pile direct queries into routers.
- Maintain structural changes in the lightweight migration logic of `backend/src/database.py`.
- API errors should preferably return user-displayable Chinese `detail` messages while preserving enough context for troubleshooting.
- Do not hardcode secrets, passwords, or tokens; use `CRF_*` environment variables or configuration uniformly.

## Frontend (Vue 3 / Vite / Element Plus)

- Put reusable logic in `frontend/src/composables/` first, avoiding duplicated business code inside components.
- API requests must go through `frontend/src/composables/useApi.js`.
- Field rendering and preview must reuse `frontend/src/composables/useCRFRenderer.js`.
- Field display rules should preferably reuse `frontend/src/composables/formFieldPresentation.js`.
- Keep semantic HTML, keyboard navigation, and appropriate ARIA attributes.
- If animations are needed, prefer mature Anime.js-style or Framer Motion-style solutions; do not hand-write a complex animation engine in the current stack.

## Cross-stack Contracts

- Column width planning changes must check both backend `backend/src/services/width_planning.py` and frontend `frontend/src/composables/useCRFRenderer.js`.
- When adjusting the column width contract, update `backend/tests/fixtures/planner_cases.json`, `backend/tests/test_width_planning.py`, and `frontend/tests/columnWidthPlanning.test.js` together.
- Ordering semantic changes require checking backend `backend/src/services/order_service.py` and frontend ordering composables together.
- Authentication flow changes require checking backend authentication services/routes and frontend `App.vue`, `LoginView.vue`, and `AdminView.vue` together.

## Git Commits

- Use Conventional Commits and keep the description in imperative mood.
- One commit should contain only one logical type of change.
- Allowed types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

## Testing

- Every `feat` / `fix` must include corresponding tests.
- Write a failing test first, then the minimal implementation, then run regression validation.
- Coverage must not decrease; the target is at least 80%.
- Backend uses `pytest`; frontend uses `node:test`.
- Changes involving authentication, permissions, project isolation, import/export, or column width contracts must add corresponding regressions.

## Security

- Do not log or display full secrets, tokens, cookies, or JWT values.
- All external input must be validated at system boundaries.
- Production-related changes must follow security constraints for `CRF_ENV`, JWT TTL, and reserved admin account repair.
- Upload/import path and file type validation must not bypass existing whitelist rules.
