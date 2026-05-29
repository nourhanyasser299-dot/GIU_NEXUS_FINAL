# PR #7 — pre-merge fixes test plan

Scope: the four fixes added in commit `e04c17a` on top of the rest of Milestone 2.
- Gate `/api/ai/skills/extract`, `/api/ai/match`, `/api/ai/summarize` behind JWT
- Remove the three hardcoded demo job cards from `#job-grid`
- Add the recruiter `company` input on the auth form
- Replace the broken `motion@latest/dist/motion.js` import with `motion@10.18.0/+esm`

The plan is adversarial — every step has a concrete pass/fail criterion. If a broken implementation could pass the same step, the step is rewritten or split.

## Environment

- Backend at `http://localhost:5000/api`, started fresh from current `feature/hf-job-summarization` HEAD (`e04c17a`) with `HF_API_TOKEN` exported. Mongo seeded with 3 jobs by [`tests/e2e/dev-bootstrap.js`](../../tests/e2e/dev-bootstrap.js).
- Frontend served by `python3 -m http.server 8080` from the repo's `Frontend/` directory.
- Browser is the built-in Chrome on the desktop, recorded.

## Tests

### Test 1 — It should load the home page with no motion.js console errors
- **Action**: Hard-reload `http://localhost:8080/index.html` and open devtools Console.
- **Pass criteria**:
  - Hero ("Get Started") visible.
  - Devtools Console has **zero** entries matching `motion.js` (case-insensitive) and zero `does not provide an export named 'animate'` / `Failed to fetch dynamically imported module` messages.
  - Probe: `typeof window._motion === 'object' && typeof window._motion.animate === 'function'` — proves the new pinned import succeeded.
- **Fail tells**: any motion-related pageerror or `_motion` is undefined.

### Test 2 — It should NOT render any static demo job cards on the Jobs board
- **Action**: Navigate to the Jobs board so `#job-grid` becomes visible (real backend up, jobs seeded).
- **Pass criteria**:
  - `document.querySelectorAll('#job-grid .job-card').length === 3` — i.e. only the 3 dynamically rendered seeded cards.
  - `[...document.querySelectorAll('#job-grid .job-card')].every(c => c.dataset.jobId && c.dataset.jobId.length > 0)` — every card carries a real Mongo `_id`.
  - `[...document.querySelectorAll('#job-grid article[onclick]')].some(c => c.getAttribute('onclick') === 'openJobModal()')` is **false** — no static no-arg `openJobModal()` cards remain.
  - The DOM does **not** contain the strings "UX Visionary", "Frontend Architect", or "Data Scientist" (the deleted demo card titles).
- **Fail tells**: any of the four checks fail.

### Test 3 — It should hide the Company field for seekers and not send `company` on seeker register
- **Action**: From `#`, click "Job Seeker" → "Get Started" → "Need an account? Create one".
- **Pass criteria**:
  - `getComputedStyle(document.getElementById('auth-name-group')).display !== 'none'`.
  - `getComputedStyle(document.getElementById('auth-company-group')).display === 'none'`.
  - Submitting `name=Adversary One`, `email=adv-seeker-{ts}@example.com`, `password=adv-pass-1` fires exactly one `POST /api/auth/register` with status `201`.
  - The request body has `role: "seeker"` and **no** `company` key (verified by reading the body via the `_capturedRegisterBody` shim — see instrumentation note).
  - `localStorage["giu-nexus.token"]` is set after the response.

### Test 4 — It should require and persist `company` on recruiter register
- **Pre-condition setup**: `api.logout()` to clear state.
- **Action**: From `#`, click "Recruiter" → "Get Started" → "Need an account? Create one".
- **Pre-condition checks**:
  - `getComputedStyle(document.getElementById('auth-name-group')).display !== 'none'`.
  - `getComputedStyle(document.getElementById('auth-company-group')).display !== 'none'` — the company group is now visible because `currentRole === 'recruiter'`.
- **Sub-test 4a — empty company is rejected client-side**:
  - Type `name=Adversary Two`, `email=adv-rec-{ts}@example.com`, `password=adv-pass-1`, leave `company` blank, click Create Account.
  - **Pass**: `#auth-company` has class `error`, `#company-error` has class `visible`, and **no** `POST /api/auth/register` request is fired (backend log unchanged).
- **Sub-test 4b — non-empty company succeeds and persists**:
  - Fill `company=Adversary Holdings Ltd`, click Create Account.
  - **Pass**: `POST /api/auth/register` returns `201`, the request body contains `company: "Adversary Holdings Ltd"` and `role: "recruiter"`, and the response `data.user.role === "recruiter"`.

### Test 5 — It should reject AI requests without a JWT (401)
- **Pre-condition**: `api.logout()` so the api client has no token in localStorage.
- **Action**: From devtools console, run three raw fetches (no `Authorization` header):
  ```js
  fetch('http://localhost:5000/api/ai/skills/extract', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: 'I built React + Node.js dashboards.' }) }).then(r => r.json().then(b => [r.status, b.message]))
  fetch('http://localhost:5000/api/ai/match',          { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ cvText: 'react node', jobs: [{ id:'1', title:'X', requirements: ['react'] }] }) }).then(r => r.json().then(b => [r.status, b.message]))
  fetch('http://localhost:5000/api/ai/summarize',      { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text: 'short text' }) }).then(r => r.json().then(b => [r.status, b.message]))
  ```
- **Pass criteria**: every promise resolves to `[401, "Authentication required"]`.
- **Fail tells**: any 200/400/500.

### Test 6 — It should accept AI requests when a valid JWT is attached
- **Pre-condition**: token in `localStorage["giu-nexus.token"]` from Test 3 (seeker).
- **Action**: Open the Seeker dashboard's "AI Skill Extract" panel, paste a CV paragraph (e.g. *"5+ years building React, TypeScript, and Node.js services. Strong with Postgres, Docker, and AWS."*), click Extract Skills.
- **Pass criteria**:
  - Status text reads **"Extracted N skills via jjzha/jobbert_skill_extraction."** (or `dslim/bert-base-NER` if the primary cold-starts) — the word "fallback" must NOT appear.
  - At least one skill chip rendered.
  - The captured request had `Authorization: Bearer <jwt>` and returned 200.
- **Sub-test 6a — match scoring**: navigate to Jobs, paste the same CV in the Score Jobs textarea, click Score Jobs.
  - **Pass**: status reads "Scored 3 jobs via sentence-transformers/all-MiniLM-L6-v2", every card grows a "X% Match" badge.
- **Sub-test 6b — summarize**: click any seeded card → Generate Summary.
  - **Pass**: source line reads "Generated by sshleifer/distilbart-cnn-12-6", summary text is non-empty.
- **Fail tells**: any source line containing "fallback" / "Heuristic" / "Jaccard" / "Extractive", or a non-2xx status on any of the three calls.

### Test 7 — It should clear the token on logout and bring back 401 behavior
- **Action**: In devtools console, run `api.logout()`. Assert `localStorage.getItem('giu-nexus.token') === null`. Re-run the three Test-5 fetches.
- **Pass criteria**: token is null, all three fetches return `[401, "Authentication required"]`.

## Instrumentation note

To verify request bodies on the Test 3 / 4 register call without parsing the dev tools network panel programmatically, I'll add a tiny in-page wrapper before each test:

```js
window._captured = [];
const _origFetch = window.fetch;
window.fetch = function(input, init) {
  if (init && init.body && /\/api\/(auth|ai)\b/.test(String(input))) {
    try { window._captured.push({ url: String(input), body: JSON.parse(init.body), headers: init.headers }); } catch {}
  }
  return _origFetch.apply(this, arguments);
};
```

After each test I'll inspect `window._captured` for the captured payload (role / company / Authorization).

## Recording & annotation plan

A single recording covers Tests 1, 2, 3, 4, 5, 6, 7 in order. Annotations:
- `setup`: "Hard-reload home page and open devtools"
- `test_start`: each `It should …` test name
- `assertion`: one consolidated assertion per test capturing the pass/fail criterion (one `passed`/`failed`/`untested` per `test_start`)

## Out of scope (not retested)

- Three-endpoint live HF demo on a single signed-in user — already recorded earlier this session against the same backend code path; the auth gate doesn't change the HF round-trip behavior.
- PR #3's seeker auth/jobs end-to-end smoke — already covered by that PR's recording.
