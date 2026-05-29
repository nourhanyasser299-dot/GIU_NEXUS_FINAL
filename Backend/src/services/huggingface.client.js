/**
 * Minimal Hugging Face Inference API client.
 *
 * Uses the global `fetch` (Node ≥ 18). Authentication is optional — without
 * `HF_API_TOKEN` the Inference API still answers for many public models, just
 * with stricter rate limits and the occasional 503 while a model warms up.
 *
 * `infer` returns the parsed JSON body on 2xx and throws an `Error` whose
 * `.status` and `.body` properties are populated on non-2xx responses, so
 * callers can decide whether to retry, fall back, or surface the error.
 */
// Updated to the post-2025 Hugging Face Inference Providers router. The legacy
// host `api-inference.huggingface.co/models/{name}` returns 404
// "Cannot POST /models/..." for every model; the new path serves the same
// hf-hosted serverless models.
const DEFAULT_BASE = 'https://router.huggingface.co/hf-inference';
const DEFAULT_TIMEOUT_MS = 25000;

function getBaseUrl() {
  return (process.env.HF_API_BASE || DEFAULT_BASE).replace(/\/$/, '');
}

function getToken() {
  return process.env.HF_API_TOKEN || '';
}

async function infer(model, payload, opts = {}) {
  if (!model || typeof model !== 'string') {
    throw new Error('huggingface.infer: model name is required');
  }
  const taskPath = opts.task ? `/pipeline/${opts.task}` : '';
  const url = `${getBaseUrl()}/models/${model}${taskPath}`;
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const body = JSON.stringify({
    inputs: payload.inputs,
    parameters: payload.parameters || undefined,
    options: { wait_for_model: true, use_cache: true, ...(payload.options || {}) }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || DEFAULT_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
  } catch (networkErr) {
    clearTimeout(timeout);
    const err = new Error(`Hugging Face network error: ${networkErr.message}`);
    err.cause = networkErr;
    err.network = true;
    throw err;
  }
  clearTimeout(timeout);

  const text = await res.text();
  let parsed = null;
  if (text) {
    try { parsed = JSON.parse(text); } catch (_e) { parsed = { raw: text }; }
  }

  if (!res.ok) {
    const err = new Error(
      (parsed && (parsed.error || parsed.message)) || `Hugging Face HTTP ${res.status}`
    );
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

module.exports = { infer, getBaseUrl, getToken };
