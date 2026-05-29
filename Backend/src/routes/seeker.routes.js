const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const role = require('../middleware/role.middleware');
const { getRecommendations, getStats } = require('../controllers/seeker.controller');

router.get('/recommendations', auth, role('seeker'), getRecommendations);
router.get('/stats', auth, role('seeker'), getStats);

module.exports = router;
