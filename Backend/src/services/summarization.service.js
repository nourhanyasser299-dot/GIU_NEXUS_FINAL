const { infer } = require('./huggingface.client');

/**
 * Job/text summarization via Hugging Face.
 *
 * Primary: `sshleifer/distilbart-cnn-12-6` (summarization task). DistilBART is
 * a small, well-served public model that handles long-form descriptions.
 *
 * If the model is unavailable / cold / rate-limited we degrade gracefully to
 * a deterministic extractive summary (first 1–2 sentences plus a clipped
 * version of the next paragraph) so the endpoint always returns *something*.
 */
const PRIMARY_MODEL = process.env.HF_SUMMARY_MODEL || 'sshleifer/distilbart-cnn-12-6';
const MIN_INPUT_CHARS = 80;
const MAX_INPUT_CHARS = 4096;

function clipText(text, max) {
  if (typeof text !== 'string') return '';
  return text.length > max ? text.slice(0, max) : text;
}

function extractiveSummary(text) {
  // Sentence-ish split tolerating abbreviations like "Node.js" by requiring
  // a space after the punctuation. Falls back to length truncation.
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length <= 2) return clipText(trimmed, 280);
  return clipText(sentences.slice(0, 2).join(' '), 320);
}

/**
 * @param {string} text
 * @param {{ minLength?: number, maxLength?: number }} [opts]
 * @returns {Promise<{ summary: string, source: 'huggingface' | 'extractive' | 'empty', model?: string }>}
 */
async function summarizeText(text, opts = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return { summary: '', source: 'empty' };
  }
  const trimmed = clipText(text.trim(), MAX_INPUT_CHARS);

  // For very short input, don't waste an HF call — the extractive path
  // returns the original text or its first sentence.
  if (trimmed.length < MIN_INPUT_CHARS) {
    return { summary: extractiveSummary(trimmed), source: 'extractive' };
  }

  const minLength = Math.max(20, Math.min(120, Number(opts.minLength) || 30));
  const maxLength = Math.max(minLength + 20, Math.min(220, Number(opts.maxLength) || 90));

  try {
    const out = await infer(PRIMARY_MODEL, {
      inputs: trimmed,
      parameters: { min_length: minLength, max_length: maxLength, do_sample: false }
    });
    // HF summarization returns either { summary_text } or [{ summary_text }].
    const summary = Array.isArray(out)
      ? (out[0] && typeof out[0].summary_text === 'string' ? out[0].summary_text : '')
      : (out && typeof out.summary_text === 'string' ? out.summary_text : '');
    if (summary.trim()) {
      return { summary: summary.trim(), source: 'huggingface', model: PRIMARY_MODEL };
    }
  } catch (_err) {
    // Fall through to extractive.
  }

  return { summary: extractiveSummary(trimmed), source: 'extractive' };
}

module.exports = { summarizeText, PRIMARY_MODEL };
