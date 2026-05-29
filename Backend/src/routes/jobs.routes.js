const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const {
  getJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob
} = require('../controllers/jobs.controller');

// Public
router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be 1–50')
  ],
  validate,
  getJobs
);

router.get('/:id', getJob);

// Protected
router.post('/',
  auth,
  role('recruiter'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('company').trim().notEmpty().withMessage('Company is required'),
    body('location').trim().notEmpty().withMessage('Location is required'),
    body('type')
      .isIn(['full-time', 'part-time', 'remote', 'hybrid', 'on-site'])
      .withMessage('Invalid job type'),
    body('description').trim().notEmpty().withMessage('Description is required')
  ],
  validate,
  createJob
);

router.put('/:id',
  auth,
  role('recruiter'),
  [
    body('type').optional().isIn(['full-time', 'part-time', 'remote', 'hybrid', 'on-site'])
  ],
  validate,
  updateJob
);

router.delete('/:id', auth, role('recruiter', 'admin'), deleteJob);

module.exports = router;
