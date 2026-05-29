const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.middleware');
const { extractSkills, matchScore, summarize } = require('../controllers/ai.controller');

// All AI endpoints require a valid JWT — they call third-party Hugging Face
// inference and we don't want anonymous users burning the quota or sending
// arbitrary text into HF logs. Rate-limit on `/api` still applies on top.
router.post('/skills/extract', auth, extractSkills);
router.post('/match', auth, matchScore);
router.post('/summarize', auth, summarize);

module.exports = router;
