const mongoose = require('mongoose');

const STATUS_ORDER = ['applied', 'screening', 'interview', 'offer', 'rejected'];

const applicationSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: STATUS_ORDER,
      default: 'applied'
    },
    cvUrl: { type: String, required: true },
    coverLetter: { type: String, default: '' },
    matchScore: { type: Number, min: 0, max: 100, default: 0 },
    extractedSkills: [{ type: String }],
    missingKeywords: [{ type: String }]
  },
  { timestamps: true }
);

// Unique constraint: one application per seeker per job
applicationSchema.index({ job: 1, applicant: 1 }, { unique: true });

// Validate status transition order
applicationSchema.methods.canTransitionTo = function (newStatus) {
  if (newStatus === 'rejected') return true; // can reject from any stage
  const currentIdx = STATUS_ORDER.indexOf(this.status);
  const newIdx = STATUS_ORDER.indexOf(newStatus);
  return newIdx === currentIdx + 1;
};

module.exports = mongoose.model('Application', applicationSchema);
