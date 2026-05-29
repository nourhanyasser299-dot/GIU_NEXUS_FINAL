# Postman collection

Manual API testing for the GIU Nexus backend. Complementary to the existing automated tests:

| What it does | Use this | Don't use this |
|---|---|---|
| Manual exploration, demos, sharing requests with teammates | This Postman collection | Jest / Playwright |
| Programmatic CI gating (44 unit tests + lint + audit) | `Backend/__tests__/` (Jest), `npm test` from `Backend/` | Postman |
| Browser end-to-end verification (DOM clicks, JS state) | `tests/e2e/run-tests.js` (Playwright over CDP) | Postman |

This directory does **not** replace anything. It's an extra entry point for poking at the backend by hand.

## Files

- `Nourhan-API.postman_collection.json` — every backend route grouped into folders (Health / Auth / Jobs / Applications / Seeker / Recruiter / Admin / AI). Collection-level Bearer auth uses `{{token}}`. Each request has a small test script that asserts on the status code (and shape, where relevant), so you can run the whole collection or a folder via Postman's Runner / Newman.
- `Nourhan-API.postman_environment.json` — `Local Dev` environment. Sets `baseUrl=http://localhost:5000` plus seed credential variables. Activate it in Postman before sending requests.

## Import

1. Open Postman → **File → Import**.
2. Drop both JSON files in (collection + environment) — Postman will recognize them automatically.
3. In the top-right environment selector, switch to **GIU Nexus — Local Dev**.
4. Make sure your backend is running locally on `http://localhost:5000` (see "Start the backend" below).

## Start the backend

The collection assumes the API is reachable at `{{baseUrl}}`. Two ways to provide that:

- **Real Mongo** — `cd Backend && cp .env.example .env`, fill `MONGO_URI` / `JWT_SECRET` / `OPENAI_API_KEY` (optional) / `HF_API_TOKEN` (optional), then `npm install && npm start`.
- **In-memory Mongo (no setup)** — from the repo root: `cd Backend && npm install && cd .. && HF_API_TOKEN=hf_xxx node tests/e2e/dev-bootstrap.js`. This boots Express + `mongodb-memory-server` + 3 seeded jobs in one shot. See `tests/e2e/README.md` for the full prerequisites.

Either way the AI folder needs a real `HF_API_TOKEN` to hit the `huggingface` source. Without one, the AI services fall back to the local heuristic / Jaccard / extractive summarizer paths and the response `source` field will say so.

## Recommended exploration order

1. **Health → `GET /api/health`** — confirms the server is up.
2. **Auth → `POST /api/auth/register (seeker)`** — creates `demo.seeker@giu-nexus.test` / `password123`. The test script auto-saves the returned JWT into the `token` collection variable.
3. **Auth → `GET /api/auth/me`** — confirms the JWT is being attached automatically to subsequent requests.
4. **Jobs → `GET /api/jobs (list, public)`** — captures the first job's `_id` into the `jobId` collection variable so the next requests can target it.
5. **Jobs → `GET /api/jobs/:id (one, public)`** — uses `{{jobId}}`.
6. **AI → `POST /api/ai/skills/extract`** / `match` / `summarize` — exercise each Hugging Face endpoint with the JWT from step 2. Watch the `source` field in the response: `huggingface` means HF answered, `heuristic` / `extractive` / `empty` means a fallback took over.

For recruiter-only flows (`POST /api/jobs`, `GET /api/recruiter/*`, etc.):
1. Run **Auth → `POST /api/auth/register (recruiter)`** to mint a recruiter JWT.
2. Recruiters start in `pending` approval. Either run **Admin → `PATCH /api/admin/recruiters/:userId/approve`** with an admin JWT, or flip `approvalStatus` directly in Mongo.
3. Then `POST /api/jobs` works.

## Run with Newman (CLI)

If you want to run the whole collection from the terminal — useful for one-off CI smoke tests, demos, or producing an HTML report — Postman ships a Node CLI called Newman.

```bash
npx --yes newman run postman/Nourhan-API.postman_collection.json \
  -e postman/Nourhan-API.postman_environment.json \
  --folder Health \
  --folder Auth \
  --folder Jobs
```

`--folder` repeated narrows the run; omit it to execute everything (which will include AI requests and admin requests that may fail without a Hugging Face token / admin JWT — that's expected).

For an HTML report:

```bash
npx --yes newman run postman/Nourhan-API.postman_collection.json \
  -e postman/Nourhan-API.postman_environment.json \
  -r cli,htmlextra --reporter-htmlextra-export newman-report.html
```

## What the test scripts assert

Each request has a small `pm.test(...)` block in its **Tests** tab. They are intentionally permissive (each accepts the realistic set of response codes — 200/201 for the happy path, 401/403/404 where auth or role might intentionally block). The goal is "did the request reach the server and come back with a sensible response", not full functional coverage. **Functional coverage lives in `Backend/__tests__/` — run `npm test` from `Backend/` for the strict checks.**

Two scripts also store values into collection variables for chaining:

- `POST /api/auth/login` and the two `register` requests → save `data.token` into `token`.
- `GET /api/jobs` and `POST /api/jobs` → save the first job's `_id` into `jobId`.

So once you log in once, every subsequent request sends the JWT automatically. There is no need to copy-paste the `Authorization` header anywhere.

## Caveats

- **`POST /api/applications` requires a real CV file.** It's a multipart request with a `cv` file field. You must pick a local PDF / DOCX in Postman before sending — the request body field is left empty in the collection on purpose.
- **AI endpoints depend on the Hugging Face Inference API.** Cold starts (HTTP 503 from HF) are normal on the first request; the backend retries internally. If HF stays down, the response `source` will fall back to `heuristic` / `extractive`.
- **Rate limit.** All `/api` routes share a 100 requests / 15 min window. If you hit `429 Too Many Requests`, slow down or restart the backend (the in-memory limiter resets on restart).
- **The `userId` env variable starts empty.** Set it manually before running admin approve / reject / delete (e.g. paste from `GET /api/admin/recruiters/pending`).
