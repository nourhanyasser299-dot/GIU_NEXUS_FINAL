const { computeMatchScore } = require('./ai.service');

/**
 * Score a list of jobs against a seeker's extracted skills.
 * @param {string[]} seekerSkills - Skills extracted from the seeker's latest CV
 * @param {Array} jobs - Array of Job documents
 * @returns {Array<{ job, matchScore }>} Sorted by matchScore descending
 */
const rankJobsForSeeker = (seekerSkills, jobs) => {
  const scored = jobs.map(job => {
    const { score } = computeMatchScore(seekerSkills, job.requirements || []);
    return { job, matchScore: score };
  });
  return scored.sort((a, b) => b.matchScore - a.matchScore);
};

module.exports = { rankJobsForSeeker };
