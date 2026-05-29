const Job = require('../models/Job');
const RecruiterProfile = require('../models/RecruiterProfile');
const { success, created, error } = require('../utils/apiResponse');

// GET /api/jobs
exports.getJobs = async (req, res) => {
  try {
    const { search, category, type, location, page = 1, limit = 10 } = req.query;
    const query = { status: 'active' };

    if (search) query.$text = { $search: search };
    if (category) query.category = category;
    if (type) query.type = type;
    if (location) query.location = new RegExp(location, 'i');

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(query).skip(skip).limit(limitNum).sort({ createdAt: -1 }).lean(),
      Job.countDocuments(query)
    ]);

    return success(res, {
      jobs,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// GET /api/jobs/:id
exports.getJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).lean();
    if (!job) return error(res, 'Job not found', 404);
    return success(res, job);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// POST /api/jobs
exports.createJob = async (req, res) => {
  try {
    // Verify recruiter is approved
    const profile = await RecruiterProfile.findOne({ user: req.user.id });
    if (!profile || profile.approvalStatus !== 'approved') {
      return error(res, 'Your recruiter account is pending approval', 403);
    }

    const job = await Job.create({ ...req.body, postedBy: req.user.id });
    return created(res, job);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// PUT /api/jobs/:id
exports.updateJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return error(res, 'Job not found', 404);
    if (job.postedBy.toString() !== req.user.id) {
      return error(res, 'Not authorized to update this job', 403);
    }

    // Prevent changing ownership
    delete req.body.postedBy;
    Object.assign(job, req.body);
    await job.save();
    return success(res, job);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// DELETE /api/jobs/:id
exports.deleteJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) return error(res, 'Job not found', 404);

    const isOwner = job.postedBy.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return error(res, 'Not authorized to delete this job', 403);
    }

    await job.deleteOne();
    return success(res, { message: 'Job deleted' });
  } catch (err) {
    return error(res, err.message, 500);
  }
};
