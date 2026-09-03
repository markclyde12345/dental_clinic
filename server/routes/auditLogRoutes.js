const express = require('express');
const router = express.Router();
const { fetchAuditLogs } = require('../controllers/auditLogController');
const { protect, authorize } = require('../middleware/auth');

// Allow Receptionist and Admin to view audit activity trails
router.get('/', protect, authorize('Receptionist', 'Admin'), fetchAuditLogs);

module.exports = router;
