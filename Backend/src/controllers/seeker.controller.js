const Application = require('../models/Application');
const Job = require('../models/Job');
const { rankJobsForSeeker } = require('../services/match.service');
const { success, error } = require('../utils/apiResponse');

// GET /api/seeker/recommendations
exports.getRecommendations = async (req, res) => {
  try {
    const activeJobs = await Job.find({ status: 'active' }).lean();

    // Get seeker's most recent application to extract skills
    const latestApp = await Application.findOne({ applicant: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    if (!latestApp || !latestApp.extractedSkills || latestApp.extractedSkills.length === 0) {
      // No skills yet — return 10 most recent jobs
      const recent = activeJobs.slice(0, 10).map(job => ({ job, matchScore: 0 }));
      return success(res, recent);
    }

    const ranked = rankJobsForSeeker(latestApp.extractedSkills, activeJobs);
    return success(res, ranked.slice(0, 10));
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// GET /api/seeker/stats
exports.getStats = async (req, res) => {
  try {
    const applications = await Application.find({ applicant: req.user.id }).lean();
    const byStatus = { applied: 0, screening: 0, interview: 0, offer: 0, rejected: 0 };
    applications.forEach(app => {
      if (byStatus[app.status] !== undefined) byStatus[app.status]++;
    });
    return success(res, { total: applications.length, byStatus });
  } catch (err) {
    return error(res, err.message, 500);
  }
};
