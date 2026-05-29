# GIU Nexus — Testing Strategy

**Project:** `HusseinSelim-1977/Nourhan_Project` (GIU Nexus)
**Stack under test:** Static HTML frontend (`Frontend/index.html`) + Node.js/Express API (`Backend/src/app.js`) + MongoDB (Mongoose) + OpenAI integration

---

## 1. Introduction and Objectives

This strategy verifies that every file in the repository is implemented, reachable, and behaves as the `Backend/BACKEND_SPEC.md` contract requires; that the single-page frontend in `Frontend/index.html` is actually wired to the API at `/api/*`; that all 20+ documented endpoints respond correctly under both nominal and adversarial conditions; and that the application connects reliably to the `MONGO_URI` defined in `.env` — including under sustained load. The deliverables are a green CI build, a documented API contract test suite, an end-to-end dashboard run for each role (seeker, recruiter, admin), and a load-test report with measured p95 latency and error budget.

Before any test execution, the team must close one prerequisite gap: the current `Frontend/index.html` contains no `fetch` or XHR calls and no references to `/api/`. The frontend therefore cannot be validated against the backend until at least the auth, jobs, and applications flows are wired through a single `apiClient` module driven by an `API_BASE_URL` constant. Treat this as test-blocking work, not a follow-up.

## 2. Step-by-Step Testing Procedures

**2.1 Repository file integrity.** Add a CI job that fails the build if any file referenced from `Backend/src/app.js` is missing, if `.env.example` keys diverge from those read in code (`PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `OPENAI_API_KEY`, `MAX_FILE_SIZE_MB`, `UPLOAD_DIR`, `RATE_LIMIT_*`), or if `npm ci` produces warnings. Run ESLint and `npm audit --production` on every push.

**2.2 Backend unit tests (Jest).** Cover the pure logic that the spec singles out: bcrypt hashing in the auth controller, JWT issuance/verification in `auth.middleware.js`, role gating in `role.middleware.js`, the pipeline state machine in `applications.controller.js` (`applied → screening → interview → offer | rejected`, no skips), and the scoring math in `services/match.service.js`. Mock `openai` and Mongoose models — no network, no DB.

**2.3 API integration tests (Supertest + mongodb-memory-server).** Spin up the Express app from `src/app.js` against an in-memory MongoDB. For every endpoint in `BACKEND_SPEC.md` write three cases: happy path, auth/role rejection, and validation rejection. Specifically verify: duplicate-application returns 409; unapproved recruiter receives 403 from `POST /api/jobs`; the `GET /api/jobs` pagination cap of 50 is enforced; `applicantCount` increments exactly once on `POST /api/applications`; and `GET /api/health` returns `{ success: true }`.

**2.4 Frontend ↔ backend contract.** Once the frontend exposes an `apiClient`, run Playwright against a locally booted stack. Assert that every UI action that should hit the API does so (browser DevTools network log captured per test), that no console error or warning fires during the seeker, recruiter, or admin flows, and that CORS, JWT bearer headers, and 401 redirect handling all behave correctly.

**2.5 Database connectivity and load.** `Backend/src/config/db.js` currently calls `process.exit(1)` on failure with no retry. Add tests that (a) start the API with an unreachable `MONGO_URI` and assert a clean failure log instead of a silent exit, (b) kill MongoDB mid-request and assert the global error handler returns 503, not a stack trace, and (c) run k6 or Artillery at 50 RPS for 5 minutes against `/api/jobs` and `/api/applications` (with mocked OpenAI) — track p95 latency, connection-pool saturation, and rate-limit responses (`/api` is capped at 100 req/15 min per IP in `app.js`).

## 3. Error Handling and Reporting

Every failed test must produce: the failing endpoint or selector, the request payload, the response body, the server log slice, and — for E2E — a Playwright trace and screenshot. Route all failures to a single `test-results/` artifact uploaded by CI. The OpenAI call inside `applications.controller.js` is the most likely source of timeout-class flakes; gate it behind a configurable timeout and assert that a slow upstream returns 504 rather than hanging the request.

## 4. Suggested Improvements

Wrap async route handlers (`express-async-errors`) so unhandled rejections reach the global error handler. Replace the hard `process.exit(1)` in `db.js` with a bounded retry plus a `/api/health` field that reflects DB state. Move the OpenAI skill extraction off the request path into a queue so application submission stays under 1 s p95. Add a `Frontend/src/api.js` module and an `.env`-injected `API_BASE_URL` so the same HTML can target dev, staging, and production.

## 5. Expected Outcomes

When this strategy is executed, every repository file is exercised by at least one test, every documented endpoint has a passing happy-path and at least one negative case, the frontend dashboards complete the seeker/recruiter/admin journeys with zero console errors, and the API sustains the target 50 RPS load with p95 under 500 ms (excluding OpenAI). Anything short of that is a release blocker, not a known issue.
