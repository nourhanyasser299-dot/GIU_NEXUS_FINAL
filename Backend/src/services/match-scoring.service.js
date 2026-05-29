const { infer } = require('./huggingface.client');

const HF_TASK = 'sentence-similarity';

/**
 * CV-to-job match scoring via Hugging Face semantic similarity.
 *
 * Uses the `sentence-similarity` task with `sentence-transformers/all-MiniLM-L6-v2`,
 * which accepts a single source sentence + an array of target sentences and
 * returns a same-length array of cosine similarities in [-1, 1] (typically
 * [0, 1] for natural-language inputs). We rescale to a 0–100 integer score.
 *
 * For each job we also compute a *local* missing-requirements list by checking
 * which entries from `job.requirements` are absent (case-insensitive substring)
 * from the CV text. The semantic score captures the overall fit; the missing
 * list gives the seeker actionable, concrete keywords.
 *
 * Falls back to a local Jaccard-like overlap when HF is unreachable so the
 * endpoint always returns a usable result.
 */
const PRIMARY_MODEL = process.env.HF_MATCH_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function scoreFromSimilarity(sim) {
  const s = typeof sim === 'number' && Number.isFinite(sim) ? clamp01(sim) : 0;
  return Math.round(s * 100);
}

function computeMissing(cvText, requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) return [];
  const lower = (cvText || '').toLowerCase();
  return requirements.filter((req) => {
    if (typeof req !== 'string' || !req.trim()) return false;
    return !lower.includes(req.toLowerCase().trim());
  });
}

function tokenSet(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9.+#-]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

function jaccardScore(cvText, jobText) {
  const a = tokenSet(cvText);
  const b = tokenSet(jobText);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const tok of a) if (b.has(tok)) inter += 1;
  const union = a.size + b.size - inter;
  if (!union) return 0;
  return Math.round((inter / union) * 100);
}

/**
 * Score one CV against many jobs.
 *
 * @param {string} cvText
 * @param {Array<{ id: string, title?: string, description: string, requirements?: string[] }>} jobs
 * @returns {Promise<{ matches: Array<{ jobId: string, score: number, missingRequirements: string[] }>, source: 'huggingface' | 'jaccard' }>}
 */
async function scoreCvAgainstJobs(cvText, jobs) {
  if (typeof cvText !== 'string' || !cvText.trim()) {
    throw new Error('cvText is required');
  }
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { matches: [], source: 'empty' };
  }

  const sentences = jobs.map((j) => {
    const title = (j && j.title) ? `${j.title}. ` : '';
    return title + String((j && j.description) || '');
  });

  // Try HF semantic similarity first.
  try {
    const out = await infer(
      PRIMARY_MODEL,
      { inputs: { source_sentence: cvText, sentences } },
      { task: HF_TASK }
    );
    if (Array.isArray(out) && out.length === jobs.length) {
      const matches = jobs.map((job, i) => ({
        jobId: String(job.id),
        score: scoreFromSimilarity(out[i]),
        missingRequirements: computeMissing(cvText, job.requirements)
      }));
      return { matches, source: 'huggingface', model: PRIMARY_MODEL };
    }
  } catch (_err) {
    // fall through to local fallback
  }

  // Local Jaccard fallback.
  const matches = jobs.map((job) => ({
    jobId: String(job.id),
    score: jaccardScore(cvText, sentences[jobs.indexOf(job)]),
    missingRequirements: computeMissing(cvText, job.requirements)
  }));
  return { matches, source: 'jaccard' };
}

module.exports = { scoreCvAgainstJobs, PRIMARY_MODEL };
