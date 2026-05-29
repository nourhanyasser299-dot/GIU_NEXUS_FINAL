# PR #3 Test Plan — Frontend ↔ Backend Wiring

**Scope:** Verify `Frontend/src/api.js` + the auth modal & jobs board changes in `Frontend/index.html` actually talk to the live Express backend, persist tokens, surface errors, and gate admin self-registration. The two pre-existing `motion.js` `pageerror`s from line 34 are NOT caused by this PR and are excluded from the pass criteria.

**Environment under test:**
- Backend: real `Backend/server.js`, fresh `mongodb-memory-server` on `mongodb://127.0.0.1:<random>`, listening on `http://localhost:5000`
- Frontend: `Frontend/index.html` served by `python3 -m http.server` on `http://localhost:8080`
- Both started fresh for this test run, no seed data

**Setup (not part of pass/fail):**
1. Boot backend via the `dev-bootstrap.js` helper (mongodb-memory-server + JWT_SECRET + `require('./server')`).
2. Boot static frontend on port 8080.
3. Pre-seed one published job by directly inserting via the admin-only `POST /api/jobs` route after registering and approving a recruiter — done via a small CDP/Playwright pre-test seed step. This is setup, not a test assertion.
4. Open `http://localhost:8080/` in Chrome.

---

## Test 1 — It should load `Frontend/index.html` with the API client wired up

**Steps**
1. Navigate to `http://localhost:8080/`.
2. After page load, evaluate in the page context:
   - `typeof window.api`
   - `window.api.getBaseUrl()`
   - `document.querySelector('script[src="src/api.js"]') !== null`
   - `document.querySelector('meta[name="api-base"]').content`

**Pass criteria (all must be true):**
- `typeof window.api === 'object'` — proves the script tag executed.
- `window.api.getBaseUrl() === 'http://localhost:5000/api'` — proves meta-tag resolution.
- The `script[src="src/api.js"]` node exists in the DOM.
- The meta `api-base` content is exactly `http://localhost:5000/api`.

**Why this would catch a bug:** If the script tag is broken (typo, MIME type, CSP), `window.api` is undefined and `getBaseUrl` would throw — every other test would then fail. If meta resolution is broken, `getBaseUrl()` would return the default but for the wrong reason; the third bullet pinpoints which path resolved.

---

## Test 2 — It should fetch jobs from `GET /api/jobs` and render them on the Jobs board

**Steps**
1. From the home view, click the "Jobs" link in the nav (calls `switchView('job-board')` which auto-fires `showJobsWithSkeleton`).
2. Wait for network idle.
3. Inspect `#job-grid.innerHTML` and the Network tab for the `/api/jobs?limit=12` request.

**Pass criteria (all must be true):**
- Exactly one `GET http://localhost:5000/api/jobs?limit=12` request fires, status 200.
- After the request resolves, `#job-grid-skeleton` has `display: none`, `#job-grid` has `display: grid`.
- `#job-grid` contains at least one `article.job-card[data-job-id]` element whose visible text includes the seeded job's title and company name (e.g. "Senior Backend Engineer" / "Acme Corp").
- The seeded job's title/company rendered through `escapeHtml` — i.e. raw HTML in the seed (e.g. `<script>` if injected) appears as escaped text in the DOM, not as a live element.

**Why this would catch a bug:** If `getJobs` doesn't actually call the backend, the `/api/jobs` request won't appear in Network. If the response shape doesn't match (`res.data.jobs`), the grid would show the empty-state copy even though jobs exist. If `escapeHtml` is missing/broken, an injected `<script>` payload would execute or render as a live element.

---

## Test 3 — It should register a new seeker and persist the JWT to localStorage

**Steps**
1. From home view, click "Sign In" in the nav (opens auth-view in login mode).
2. Click the "Need an account? Create one" toggle link to switch to register mode.
3. Verify the heading reads exactly **"Create Your Account"**, the name field is now visible, and the submit button reads **"Create Account"**.
4. Fill: name = `UI Smoke <script>alert(1)</script>`, email = `seeker-${Date.now()}@giu.edu.eg`, password = `password123`.
5. Click "Create Account".

**Pass criteria (all must be true):**
- Network tab shows `POST http://localhost:5000/api/auth/register` with status `201`.
- Request body is JSON containing `{ name, email, password, role: "seeker" }` — confirms `currentRole` defaulting works.
- After response: `localStorage.getItem('giu-nexus.token')` is a non-empty string starting with `eyJ` (JWT).
- The status banner shows green "Account created. Redirecting…".
- Within 1 second, the active view becomes `seeker-dash` (i.e. `#seeker-dash` has `style="display:..."` matching the visible state and `#auth-view` is hidden).
- No `<script>` from the malicious name payload executes (no alert dialog, no unexpected `console.error` from injected code).

**Why this would catch a bug:** If `api.register` doesn't extract `res.data.token` correctly, the token write silently no-ops and the user appears "logged in" but every subsequent authenticated call would fail. If `setAuthMode` doesn't show the name field, the validation passes but the backend rejects the request as missing `name`. If `escapeHtml`/text-content handling leaks the script tag anywhere, the alert would fire.

---

## Test 4 — It should sign in with the just-registered seeker and replace the token

**Steps**
1. After Test 3, capture the token: `tokenA = localStorage.getItem('giu-nexus.token')`.
2. Call `window.api.logout()` from the page context.
3. Verify `localStorage.getItem('giu-nexus.token') === null`.
4. Click the "Sign In" nav button to return to auth-view (login mode).
5. Fill the same email + password and click "Sign In".

**Pass criteria (all must be true):**
- Network tab shows `POST /api/auth/login` with status `201` (per backend) or `200` — accept whichever the controller returns; reject 4xx/5xx.
- Status banner is green "Signed in. Redirecting…".
- New token `tokenB = localStorage.getItem('giu-nexus.token')` is non-empty and `tokenB !== tokenA` — proves a fresh JWT was issued, not a stale cached one.
- Active view becomes `seeker-dash`.
- A subsequent `window.api.me()` call returns `{ success: true, data: { user: { email: <same email> } } }`.

**Why this would catch a bug:** If `api.logout` doesn't actually clear localStorage, `tokenA === tokenB`. If the login handler attaches a stale Authorization header, `me()` would resolve against a different account.

---

## Test 5 — It should surface a backend error for invalid credentials

**Steps**
1. From the same auth-view (login mode), `api.logout()` to clear state.
2. Fill email = the same seeker email from Test 3, password = `wrong-password-123`.
3. Click "Sign In".

**Pass criteria (all must be true):**
- Network tab shows `POST /api/auth/login` with status `401`.
- The status banner becomes red and visible (not `display: none`) and contains text matching `/invalid|incorrect|credentials/i`.
- `localStorage.getItem('giu-nexus.token') === null` — no token was written despite the failed call.
- Active view remains `auth-view` (no auto-redirect to a dashboard).
- The submit button text resets to "Sign In" (not stuck at "Signing in…") and `disabled` is `false`.

**Why this would catch a bug:** If `request()` swallows the error or the `.then(...)` on the success path runs anyway, the token would get written for a failed login. If the `finally` block doesn't restore button state, the form is unusable on retry.

---

## Test 6 — It should block admin self-registration with a clear status message

**Steps**
1. Hard-reload `http://localhost:8080/`.
2. On the hero view, click the "Admin" role pill (sets `currentRole = 'admin'`).
3. Click "Launch Experience" then click the "Create Account" CTA on the right panel (calls `setAuthMode('register')`).
4. Fill name = `Admin Try`, email = `admin-${Date.now()}@giu.edu.eg`, password = `password123`.
5. Click "Create Account".

**Pass criteria (all must be true):**
- No network request to `/api/auth/register` is made — the client-side guard blocks it.
- The status banner is red and reads exactly: `Admin accounts cannot self-register. Pick Job Seeker or Recruiter on the home page.`
- `localStorage.getItem('giu-nexus.token') === null`.
- Active view remains `auth-view`.
- The submit button text is back to "Create Account" and `disabled === false`.

**Why this would catch a bug:** If the admin guard runs *after* the network call instead of before, the request would still hit the backend (which would also reject it but for a different, less explicit reason). If the role-mapping in the request body sends `role: "admin"` regardless, this test would have caught the wrong escalation path.

---

## Console error budget (applies across all tests)

After all 6 tests run, capture every `pageerror` and `console.error` event. The test run **passes** only if every captured entry is one of the two known pre-existing `motion.js` errors:

```
The requested module 'https://cdn.jsdelivr.net/npm/motion@latest/dist/motion.js' does not provide an export named 'animate'
```

Any other `pageerror`, uncaught promise rejection, or `console.error` is a fail — it would mean this PR introduced a new runtime error.

---

## Recording

Tests are GUI-driven (clicking nav, filling forms, inspecting DOM). I'll record the full session and annotate each test with `test_start` / `assertion` markers. Recording is started right after the setup steps and stopped after Test 6.
