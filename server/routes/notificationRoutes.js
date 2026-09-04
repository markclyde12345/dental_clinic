const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getUserNotifications } = require('../controllers/notificationController');

// All notifications routes require authentication
router.use(protect);

router.get('/', getUserNotifications);

module.exports = router;
