const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');
const validate = require('../middleware/validate.middleware');
const {
  getStats,
  getPendingRecruiters,
  approveRecruiter,
  rejectRecruiter,
  deleteUser
} = require('../controllers/admin.controller');

router.get('/stats', auth, role('admin'), getStats);
router.get('/recruiters/pending', auth, role('admin'), getPendingRecruiters);

router.patch('/recruiters/:userId/approve', auth, role('admin'), approveRecruiter);

router.patch('/recruiters/:userId/reject',
  auth,
  role('admin'),
  [body('reason').optional().isString()],
  validate,
  rejectRecruiter
);

router.delete('/users/:userId', auth, role('admin'), deleteUser);

module.exports = router;
