const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RecruiterProfile = require('../models/RecruiterProfile');
const { success, created, error } = require('../utils/apiResponse');

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

const userPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role
});

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, company } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return error(res, 'Email already registered', 409);

    const user = await User.create({ name, email, password, role });

    // Create recruiter profile if role is recruiter
    if (role === 'recruiter') {
      await RecruiterProfile.create({
        user: user._id,
        company: company || 'Unknown Company'
      });
    }

    const token = signToken(user);
    return created(res, { token, user: userPayload(user) });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Select password explicitly (it's excluded by default)
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return error(res, 'Invalid credentials', 401);
    }

    const token = signToken(user);
    return success(res, { token, user: userPayload(user) });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return error(res, 'User not found', 404);
    return success(res, { user: userPayload(user) });
  } catch (err) {
    return error(res, err.message, 500);
  }
};
