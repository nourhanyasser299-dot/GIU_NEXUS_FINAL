const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const upload = require('../middleware/upload.middleware');
const {
  applyToJob,
  getMyApplications,
  getJobApplications,
  updateStatus
} = require('../controllers/applications.controller');

// POST /api/applications — seeker submits application with CV upload
router.post('/',
  auth,
  role('seeker'),
  upload.single('cv'),
  [
    body('jobId').notEmpty().withMessage('Job ID is required').isMongoId().withMessage('Invalid job ID')
  ],
  validate,
  applyToJob
);

// GET /api/applications/my — seeker views their own applications
router.get('/my', auth, role('seeker'), getMyApplications);

// GET /api/applications/job/:jobId — recruiter/admin views applications for a job
router.get('/job/:jobId', auth, role('recruiter', 'admin'), getJobApplications);

// PATCH /api/applications/:id/status — recruiter/admin updates pipeline status
router.patch('/:id/status',
  auth,
  role('recruiter', 'admin'),
  [
    body('status')
      .isIn(['screening', 'interview', 'offer', 'rejected'])
      .withMessage('Invalid status value')
  ],
  validate,
  updateStatus
);

module.exports = router;
