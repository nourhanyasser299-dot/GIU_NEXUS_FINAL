const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
    },
    password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
    role: { type: String, enum: ['seeker', 'recruiter', 'admin'], required: true }
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Cascade delete: remove recruiter profile, jobs, and applications on user delete
userSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  const userId = this._id;
  await mongoose.model('RecruiterProfile').deleteOne({ user: userId });
  const jobs = await mongoose.model('Job').find({ postedBy: userId }).select('_id');
  const jobIds = jobs.map(j => j._id);
  await mongoose.model('Job').deleteMany({ postedBy: userId });
  await mongoose.model('Application').deleteMany({
    $or: [{ applicant: userId }, { job: { $in: jobIds } }]
  });
  next();
});

module.exports = mongoose.model('User', userSchema);
