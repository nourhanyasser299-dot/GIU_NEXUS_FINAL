const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const RecruiterProfile = require('../models/RecruiterProfile');
const { success, error } = require('../utils/apiResponse');

// GET /api/admin/stats
exports.getStats = async (req, res) => {
  try {
    const [totalUsers, activeJobs, totalApplications, pendingRecruiters] = await Promise.all([
      User.countDocuments(),
      Job.countDocuments({ status: 'active' }),
      Application.countDocuments(),
      RecruiterProfile.countDocuments({ approvalStatus: 'pending' })
    ]);
    return success(res, { totalUsers, activeJobs, totalApplications, pendingRecruiters });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// GET /api/admin/recruiters/pending
exports.getPendingRecruiters = async (req, res) => {
  try {
    const profiles = await RecruiterProfile.find({ approvalStatus: 'pending' })
      .populate('user', 'name email createdAt')
      .lean();
    return success(res, profiles);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// PATCH /api/admin/recruiters/:userId/approve
exports.approveRecruiter = async (req, res) => {
  try {
    const profile = await RecruiterProfile.findOne({ user: req.params.userId });
    if (!profile) return error(res, 'Recruiter profile not found', 404);

    profile.approvalStatus = 'approved';
    profile.approvedBy = req.user.id;
    profile.approvedAt = new Date();
    await profile.save();

    return success(res, { message: 'Recruiter approved' });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// PATCH /api/admin/recruiters/:userId/reject
exports.rejectRecruiter = async (req, res) => {
  try {
    const profile = await RecruiterProfile.findOne({ user: req.params.userId });
    if (!profile) return error(res, 'Recruiter profile not found', 404);

    profile.approvalStatus = 'rejected';
    profile.rejectionReason = req.body.reason || '';
    await profile.save();

    return success(res, { message: 'Recruiter rejected' });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// DELETE /api/admin/users/:userId
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return error(res, 'User not found', 404);
    if (user.role === 'admin') return error(res, 'Cannot delete admin accounts', 403);

    await user.deleteOne(); // triggers cascade middleware
    return success(res, { message: 'User deleted' });
  } catch (err) {
    return error(res, err.message, 500);
  }
};
