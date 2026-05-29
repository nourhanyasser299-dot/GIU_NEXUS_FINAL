const { extractSkillsFromText } = require('../services/skill-extraction.service');
const { scoreCvAgainstJobs } = require('../services/match-scoring.service');
const { summarizeText } = require('../services/summarization.service');
const { success, error } = require('../utils/apiResponse');

const MAX_INPUT_CHARS = 8000;
const MAX_JOBS = 20;

// POST /api/ai/skills/extract
// Body: { text: string }
// Returns: { skills: string[], source: 'huggingface' | 'heuristic' | 'empty', model?: string }
exports.extractSkills = async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim()) {
      return error(res, 'Field "text" is required and must be a non-empty string', 400);
    }
    const trimmed = text.slice(0, MAX_INPUT_CHARS);
    const result = await extractSkillsFromText(trimmed);
    return success(res, result);
  } catch (err) {
    return error(res, err.message || 'Failed to extract skills', err.status || 500);
  }
};

// POST /api/ai/match
// Body: { cvText: string, jobs: [{ id, title?, description, requirements? }] }
// Returns: { matches: [{ jobId, score, missingRequirements }], source, model? }
exports.matchScore = async (req, res) => {
  try {
    const cvText = typeof req.body?.cvText === 'string' ? req.body.cvText : '';
    const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : null;
    if (!cvText.trim()) return error(res, 'Field "cvText" is required', 400);
    if (!jobs || jobs.length === 0) {
      return error(res, 'Field "jobs" must be a non-empty array of { id, description }', 400);
    }
    if (jobs.length > MAX_JOBS) {
      return error(res, `Too many jobs (max ${MAX_JOBS})`, 400);
    }
    for (const j of jobs) {
      if (!j || typeof j.id !== 'string' || typeof j.description !== 'string') {
        return error(res, 'Each job must have string "id" and "description"', 400);
      }
    }
    const trimmedCv = cvText.slice(0, MAX_INPUT_CHARS);
    const trimmedJobs = jobs.map((j) => ({
      id: j.id,
      title: typeof j.title === 'string' ? j.title.slice(0, 200) : '',
      description: j.description.slice(0, MAX_INPUT_CHARS),
      requirements: Array.isArray(j.requirements) ? j.requirements.slice(0, 50) : []
    }));
    const result = await scoreCvAgainstJobs(trimmedCv, trimmedJobs);
    return success(res, result);
  } catch (err) {
    return error(res, err.message || 'Failed to compute match scores', err.status || 500);
  }
};

// POST /api/ai/summarize
// Body: { text: string, minLength?: number, maxLength?: number }
// Returns: { summary: string, source: 'huggingface' | 'extractive' | 'empty', model?: string }
exports.summarize = async (req, res) => {
  try {
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim()) return error(res, 'Field "text" is required', 400);
    const result = await summarizeText(text.slice(0, MAX_INPUT_CHARS), {
      minLength: req.body?.minLength,
      maxLength: req.body?.maxLength
    });
    return success(res, result);
  } catch (err) {
    return error(res, err.message || 'Failed to summarize', err.status || 500);
  }
};
