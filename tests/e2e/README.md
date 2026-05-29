# End-to-end test suite

This is the Playwright + real-backend adversarial E2E suite that drove the PR #7 verification. It connects to a Chrome instance over CDP, drives the live frontend at `http://localhost:8080`, and hits the live backend at `http://localhost:5000/api`.

## Prerequisites

- A running Chrome with `--remote-debugging-port=29229` (any tab).
- A backend running on port 5000 with Mongo (in-memory or real) seeded with at least 3 jobs. The `dev-bootstrap.js` helper in this folder boots Express + `mongodb-memory-server` and seeds the same 3 jobs the suite expects.
- An `HF_API_TOKEN` exported in the backend's environment (the suite hits live Hugging Face Inference for Test 6).
- A frontend served at `http://localhost:8080`. The fastest way: `cd Frontend && python3 -m http.server 8080`.

## Running

```bash
# Terminal 1 — backend
HF_API_TOKEN=hf_xxx node tests/e2e/dev-bootstrap.js

# Terminal 2 — frontend
cd Frontend && python3 -m http.server 8080

# Terminal 3 — runner
node tests/e2e/run-tests.js
```

Output: per-test PASS/FAIL lines + JSON probe data + an `ALL TESTS PASSED` summary. The full plan and matching pass criteria are in [`docs/milestone-2/07-test-plan-pr7.md`](../../docs/milestone-2/07-test-plan-pr7.md).

## What the suite covers

| # | Test | What it checks |
|---|------|----------------|
| T1 | motion.js console clean | The `motion@10.18.0/+esm` dynamic import succeeds (no legacy `motion@latest/dist/motion.js`); no motion-related `pageerror`s. |
| T2 | Static demo job cards removed | `#job-grid` has exactly 3 cards, each with a Mongo `_id`, no `onclick="openJobModal()"` no-arg cards, no demo titles. |
| T3 | Seeker register hides + omits company | `auth-company-group` is `display:none` for seekers; `POST /api/auth/register` body has no `company` key. |
| T4 | Recruiter register requires + persists company | `auth-company-group` is `display:flex` for recruiters; empty company shows red error and fires zero requests; filled company → 201 with `role:"recruiter"` + `company:"..."`. |
| T5 | AI endpoints 401 without JWT | All 3 `/api/ai/*` routes return `401 "Authentication required"` for anonymous callers. |
| T6 | AI endpoints 200 with JWT | Same 3 routes return `200`, `source:"huggingface"`, real model attribution when called with `Authorization: Bearer <jwt>`. |
| T7 | Logout brings back 401 | After `api.logout()`, the localStorage token is null and the same routes return 401 again. |

## Notes / gotchas

- The runner installs a `window.fetch` capture wrapper via `page.addInitScript()` so the wrapper survives navigations / reloads.
- The `auth-view` section is layered behind a fixed-position 3D `<canvas>` background. The DOM is correct (probes confirm this) but full-page screenshots may appear black; the test asserts on `getComputedStyle(...)` rather than visual rendering.
- The frontend's `switchView()` is the actual nav handler — direct `<a href="#...">` clicks don't navigate. The runner calls `switchView(...)` via `page.evaluate(...)` instead.
- Demo titles ("UX Visionary", "Frontend Architect", "Data Scientist") must match exactly — substring matching produces false positives because `"Junior Data Scientist"` is a real seeded job.
