const express = require('express');
const router  = express.Router();
const { dentalChat, supportChat } = require('../controllers/aiController');

// Rate limiter specifically for AI endpoints (more lenient than auth)
const rateLimit = require('express-rate-limit');
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  message: { message: 'Too many AI requests. Please slow down.' },
});

router.use(aiLimiter);

// POST /api/ai/dental  — Dental symptom chatbot
router.post('/dental', dentalChat);

// POST /api/ai/support — General system support chatbot
router.post('/support', supportChat);

module.exports = router;
