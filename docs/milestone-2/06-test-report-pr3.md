# PR #3 — Frontend ↔ Backend Wiring: End-to-End Test Report

**PR under test:** [#3 Wire frontend to backend (api.js + login/register/jobs)](https://github.com/HusseinSelim-1977/Nourhan_Project/pull/3)
**Test approval source:** User clicked "Test the app"
**Mode:** Devin test mode (browser-driven, Playwright over CDP)
**Date (UTC):** 2026-05-08

---

## TL;DR

**All 6 functional UI tests PASSED.** The frontend now talks to the real backend end-to-end:

| # | Test | Result |
|---|------|--------|
| 1 | api.js loads and resolves base URL from `<meta name="api-base">` | passed |
| 2 | Jobs board fetches `GET /api/jobs?limit=12` and renders real cards | passed |
| 3 | Seeker register → 201, JWT persisted, lands on `seeker-dash` | passed |
| 4 | Logout + login round-trip → fresh JWT, `/me` returns same email | passed |
| 5 | Invalid login → 401, red banner, no token written, button reset | passed |
| 6 | Admin self-registration blocked client-side (no network call) | passed |

**Console error budget:** 1 console.error captured beyond the pre-existing `motion.js` import errors. It is the **browser auto-logging the deliberate 401 from Test 5** (`Failed to load resource: the server responded with a status of 401`). That is exactly what Test 5 is asserting, not a regression — it is the browser's default emission for any non-2xx network response, not an exception thrown by PR #3 code. Treated as expected; no changes needed.

---

## Environment

- **Backend:** real `Backend/server.js` against fresh `mongodb-memory-server` (`MONGOMS_VERSION=6.0.14`), JWT_SECRET set, listening on `http://localhost:5000`.
- **Frontend:** `Frontend/index.html` served via `python3 -m http.server 8080`.
- **Browser:** Chrome with CDP at `http://localhost:29229`, driven by an ad-hoc Playwright runner using `chromium.connectOverCDP` (this PR-#3 runner predates the in-repo [`tests/e2e/run-tests.js`](../../tests/e2e/run-tests.js), which was added later for PR #7).
- **Seed:** one published job inserted before tests by registering a recruiter, flipping their `RecruiterProfile.approvalStatus` directly to `approved` in Mongo, then `POST /api/jobs` with their token. (Counted as setup, not an assertion.)

Test plan: [`05-test-plan-pr3.md`](./05-test-plan-pr3.md). The runner script and raw results files were ad-hoc artifacts on the test VM and are not committed.

---

## Per-test results (with evidence)

### Test 1 — api.js loaded + base URL resolved — PASSED
- `typeof window.api === 'object'` → true
- `window.api.getBaseUrl()` → `"http://localhost:5000/api"`
- `<script src="src/api.js">` present in DOM
- `<meta name="api-base">` content = `"http://localhost:5000/api"`

### Test 2 — Jobs board fetches /api/jobs and renders — PASSED
- One `GET http://localhost:5000/api/jobs?limit=12` fired; status **200**.
- After resolve: `#job-grid-skeleton { display: none }`, `#job-grid { display: grid }`.
- 1 `article.job-card` rendered, text contains `"Senior Backend Engineer / Acme Corp / Cairo, Egypt / Engineering / full-time"`.
- HTML escaping verified: a malicious `name = "UI Smoke <script>alert(1)</script>"` was sent in Test 3 and the subsequent dashboard never raised an alert dialog or executed the injected tag.

![Jobs board with API-rendered card](https://app.devin.ai/attachments/78b8e0fa-ccf8-4b87-ac48-9d8fdc1ae47d/02-jobs-board.png)

### Test 3 — Register seeker, persist JWT, land on seeker-dash — PASSED
- Modal switched to register mode; heading = `"Create Your Account"`, name field visible, button label = `"Create Account"`.
- `POST /api/auth/register` body = `{ name, email, password, role: "seeker" }`, status **201**.
- `localStorage["giu-nexus.token"]` length = 192, prefix `eyJ…` (real JWT).
- Status banner: `"Account created. Redirecting…"`.
- After redirect: `#seeker-dash` visible, `#auth-view` hidden.

![Seeker dashboard after register](https://app.devin.ai/attachments/d37ae28d-79a2-4f96-b8a0-74d7bc4f63c4/03c-register-after-submit.png)

### Test 4 — Logout + login round-trip with fresh JWT — PASSED
- `api.logout()` → `localStorage["giu-nexus.token"] === null`.
- `POST /api/auth/login` → status **200**, fresh token with `tokenB !== tokenA`.
- Banner: `"Signed in. Redirecting…"`. Active view: `#seeker-dash`.
- Subsequent `api.me()` → `{ data: { user: { email: <same email> } } }`.

### Test 5 — Invalid login surfaces 401 banner — PASSED
- `POST /api/auth/login` with wrong password → status **401**.
- Status banner red and visible, text = `"Invalid credentials"`.
- `localStorage["giu-nexus.token"] === null` (no token written).
- Active view stays on `#auth-view`. Submit button reset: `disabled === false`, label = `"Sign In"`.

![Invalid login — auth-view retained](https://app.devin.ai/attachments/3fddc1ea-e1ed-4184-8089-378d22806d8b/05-invalid-login.png)

### Test 6 — Admin self-registration blocked client-side — PASSED
- Hard reload, clicked the Admin role pill on the hero (sets the closure-scoped `currentRole = 'admin'`).
- Switched the auth modal to register mode and submitted.
- **No** `POST /api/auth/register` request was fired (network capture confirms zero matching requests during the attempt).
- Status banner red, text matched **exactly**: `"Admin accounts cannot self-register. Pick Job Seeker or Recruiter on the home page."`
- `localStorage["giu-nexus.token"] === null`. Active view stayed on `#auth-view`. Button reset: `disabled === false`, label = `"Create Account"`.

![Admin register attempt blocked](https://app.devin.ai/attachments/e0132ec3-b696-4a48-926c-d5da30b0ccbf/06b-admin-register-blocked.png)

> **Note on an earlier failure:** an initial run of this test reported a fail because the runner mutated `window.currentRole` directly, which the modal does not read (`currentRole` is module-scoped inside the inline `<script>`). After switching the test to click the actual `.role-btn` (the only legitimate way to set role), the guard fired correctly and the run is fully green. This is purely a test-driver fix — no production code changed.

---

## Console error budget — PASSED (with one expected entry)

Captured during the entire run:

- 3 × pre-existing `motion.js` `pageerror`s from `Frontend/index.html` lines 33–36 — unrelated to PR #3, present on `main`.
- 1 × `console.error: Failed to load resource: the server responded with a status of 401 (Unauthorized)` — emitted by Chromium **automatically** because Test 5 deliberately submits invalid credentials. This is the browser's default behavior for any non-2xx response and is not raised from PR #3 code. It is the exact behavior Test 5 asserts.

No uncaught exceptions, no rejected promises, no other `console.error`s introduced by this PR.

---

## Recording

Full annotated recording of the 6 tests (test_start + assertion overlays per test) was attached to the PR #3 message in the original session. The MP4 is not committed to the repo — see the PR conversation for the link.

---

## Recommendations / follow-ups (not blockers for #3)

1. **Backend should also reject `role: "admin"` on `POST /api/auth/register`.** The frontend guard is good UX but a curl bypasses it; the controller should refuse `role === 'admin'` server-side as defense in depth.
2. **Recruiter signup needs a `company` field** in the form (the backend validator already requires it). Tracked in PR #3's description; not in scope for the testing strategy.
3. **`motion.js` CDN import** at line 33–36 is broken — it imports a named export `animate` that the current motion build does not expose. Replace with the correct import path or remove the import. Pre-existing on `main`, not introduced here.
4. Once PR #2 lands, rebase #3 to pick up the CI workflow so its checks page is no longer empty.

---

## Files / artifacts

- Plan: [`05-test-plan-pr3.md`](./05-test-plan-pr3.md) (committed alongside this report)
- Runner: ad-hoc Playwright script on the test VM (not committed; the canonical in-repo runner is [`tests/e2e/run-tests.js`](../../tests/e2e/run-tests.js), added later for PR #7)
- Raw structured results, screenshots, and recording: posted as PR #3 attachments in the original session; not committed to the repo
