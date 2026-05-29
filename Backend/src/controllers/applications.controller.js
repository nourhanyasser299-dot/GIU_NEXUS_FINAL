const Application = require('../models/Application');
const Job = require('../models/Job');
const { extractSkills, computeMatchScore } = require('../services/ai.service');
const { success, created, error } = require('../utils/apiResponse');

// POST /api/applications
exports.applyToJob = async (req, res) => {
  try {
    const { jobId, coverLetter } = req.body;

    const job = await Job.findById(jobId);
    if (!job || job.status !== 'active') return error(res, 'Job not found or inactive', 404);

    // Check for duplicate application
    const existing = await Application.findOne({ job: jobId, applicant: req.user.id });
    if (existing) return error(res, 'You have already applied to this job', 409);

    if (!req.file) return error(res, 'CV file is required', 400);

    const cvUrl = req.file.path;

    // AI processing — non-blocking fallback
    let extractedSkills = [];
    let matchScore = 0;
    let missingKeywords = [];
    try {
      extractedSkills = await extractSkills(cvUrl);
      const result = computeMatchScore(extractedSkills, job.requirements);
      matchScore = result.score;
      missingKeywords = result.missingKeywords;
    } catch (aiErr) {
      console.error('AI processing failed, continuing without scores:', aiErr.message);
    }

    const application = await Application.create({
      job: jobId,
      applicant: req.user.id,
      cvUrl,
      coverLetter: coverLetter || '',
      matchScore,
      extractedSkills,
      missingKeywords
    });

    // Increment applicant count
    await Job.findByIdAndUpdate(jobId, { $inc: { applicantCount: 1 } });

    return created(res, {
      applicationId: application._id,
      matchScore,
      extractedSkills,
      missingKeywords
    });
  } catch (err) {
    if (err.code === 11000) return error(res, 'You have already applied to this job', 409);
    return error(res, err.message, 500);
  }
};

// GET /api/applications/my
exports.getMyApplications = async (req, res) => {
  try {
    const applications = await Application.find({ applicant: req.user.id })
      .populate('job', 'title company location type status')
      .sort({ createdAt: -1 })
      .lean();
    return success(res, applications);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// GET /api/applications/job/:jobId
exports.getJobApplications = async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) return error(res, 'Job not found', 404);

    const isOwner = job.postedBy.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return error(res, 'Not authorized', 403);

    const applications = await Application.find({ job: req.params.jobId })
      .populate('applicant', 'name email')
      .sort({ matchScore: -1 })
      .lean();
    return success(res, applications);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// PATCH /api/applications/:id/status
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const application = await Application.findById(req.params.id).populate('job');
    if (!application) return error(res, 'Application not found', 404);

    const isOwner = application.job.postedBy.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return error(res, 'Not authorized', 403);

    if (!application.canTransitionTo(status)) {
      return error(res, `Invalid status transition from '${application.status}' to '${status}'`, 422);
    }

    application.status = status;
    await application.save();
    return success(res, application);
  } catch (err) {
    return error(res, err.message, 500);
  }
};
