const Job = require('../models/Job');
const Application = require('../models/Application');
const { success, error } = require('../utils/apiResponse');

// GET /api/recruiter/jobs
exports.getMyJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ postedBy: req.user.id }).sort({ createdAt: -1 }).lean();
    return success(res, jobs);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// GET /api/recruiter/pipeline
exports.getPipeline = async (req, res) => {
  try {
    const jobs = await Job.find({ postedBy: req.user.id }).select('_id').lean();
    const jobIds = jobs.map(j => j._id);

    const applications = await Application.find({ job: { $in: jobIds } })
      .populate('applicant', 'name email')
      .populate('job', 'title company')
      .lean();

    const pipeline = { applied: [], screening: [], interview: [], offer: [] };
    applications.forEach(app => {
      if (pipeline[app.status]) pipeline[app.status].push(app);
    });

    return success(res, pipeline);
  } catch (err) {
    return error(res, err.message, 500);
  }
};
