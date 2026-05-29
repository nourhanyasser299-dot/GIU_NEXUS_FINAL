const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');
const { getMyJobs, getPipeline } = require('../controllers/recruiter.controller');

router.get('/jobs', auth, role('recruiter'), getMyJobs);
router.get('/pipeline', auth, role('recruiter'), getPipeline);

module.exports = router;
