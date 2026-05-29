const { infer } = require('./huggingface.client');

/**
 * Extract skills from raw text using a Hugging Face token-classification model.
 *
 * The default model (`jjzha/jobbert_skill_extraction`) tags individual tokens
 * with B-Skill / I-Skill labels; we glue adjacent skill tokens back together
 * into phrases, dedupe, and return them in input order.
 *
 * Falls back to a general NER model (`dslim/bert-base-NER`) if the primary
 * model is unavailable, and finally to a tiny keyword heuristic so the API
 * never returns an empty 5xx to the user.
 */
const PRIMARY_MODEL = process.env.HF_SKILL_MODEL || 'jjzha/jobbert_skill_extraction';
const FALLBACK_MODEL = 'dslim/bert-base-NER';

const HEURISTIC_SKILLS = [
  'javascript', 'typescript', 'react', 'node.js', 'node', 'express', 'mongodb',
  'sql', 'python', 'java', 'go', 'rust', 'docker', 'kubernetes', 'aws', 'gcp',
  'azure', 'graphql', 'rest', 'redis', 'postgresql', 'mysql', 'git', 'linux',
  'tensorflow', 'pytorch', 'pandas', 'numpy', 'figma', 'sketch', 'css', 'html'
];

function joinSpans(tokens, text) {
  // tokens look like [{ entity_group?: 'SKILL'|'B'|'I', word: '##script', start, end }, ...]
  // jjzha/jobbert_skill_extraction outputs `B` / `I` (skill begin/inside); other
  // skill-tagging variants emit `B-SKILL` / `I-SKILL` or a plain `SKILL` group.
  // Accept all of them.
  const skillTokens = tokens.filter((t) => {
    const label = (t.entity_group || t.entity || '').toUpperCase();
    if (!label || label === 'O') return false;
    return label === 'B' || label === 'I' || label.includes('SKILL');
  });
  if (!skillTokens.length) return [];

  const merged = [];
  let current = null;
  for (const tk of skillTokens) {
    if (typeof tk.start !== 'number' || typeof tk.end !== 'number') continue;
    if (current && tk.start <= current.end + 1) {
      current.end = tk.end;
    } else {
      if (current) merged.push(current);
      current = { start: tk.start, end: tk.end };
    }
  }
  if (current) merged.push(current);

  const seen = new Set();
  const out = [];
  for (const span of merged) {
    const phrase = text.slice(span.start, span.end).trim();
    const key = phrase.toLowerCase();
    if (phrase && !seen.has(key)) {
      seen.add(key);
      out.push(phrase);
    }
  }
  return out;
}

function joinNerEntities(tokens, text) {
  const allowed = new Set(['MISC', 'ORG']);
  return joinSpans(
    tokens.map((t) => {
      const label = (t.entity_group || t.entity || '').replace(/^B-|^I-/, '').toUpperCase();
      return allowed.has(label)
        ? { ...t, entity_group: 'SKILL' }
        : t;
    }),
    text
  );
}

function heuristicExtract(text) {
  const lower = text.toLowerCase();
  const hits = [];
  const seen = new Set();
  for (const skill of HEURISTIC_SKILLS) {
    if (lower.includes(skill) && !seen.has(skill)) {
      seen.add(skill);
      hits.push(skill);
    }
  }
  return hits;
}

async function extractSkillsFromText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { skills: [], source: 'empty' };
  }

  // 1. Primary skill-tagging model.
  try {
    const out = await infer(PRIMARY_MODEL, { inputs: text });
    const skills = Array.isArray(out) ? joinSpans(out, text) : [];
    if (skills.length) return { skills, source: 'huggingface', model: PRIMARY_MODEL };
  } catch (err) {
    // Fall through to the next strategy.
  }

  // 2. Fallback: general NER, treat ORG/MISC as candidate skills.
  try {
    const out = await infer(FALLBACK_MODEL, { inputs: text });
    const skills = Array.isArray(out) ? joinNerEntities(out, text) : [];
    if (skills.length) return { skills, source: 'huggingface', model: FALLBACK_MODEL };
  } catch (err) {
    // Final fallback below.
  }

  // 3. Last-resort heuristic so the endpoint always returns *something*.
  const hits = heuristicExtract(text);
  return { skills: hits, source: 'heuristic' };
}

module.exports = { extractSkillsFromText, PRIMARY_MODEL, FALLBACK_MODEL };
