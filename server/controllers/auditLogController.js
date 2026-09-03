const { getAuditLogs } = require('../utils/auditLogger');

// @desc    Get audit logs
// @route   GET /api/audit-logs
// @access  Private (Receptionist, Admin)
const fetchAuditLogs = async (req, res) => {
  try {
    const { limit = 50, action, entityType } = req.query;
    const logs = await getAuditLogs({
      limit: parseInt(limit, 10) || 50,
      action,
      entityType
    });

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('[Audit Log Controller Error]', error);
    res.status(500).json({ message: 'Failed to retrieve audit trail' });
  }
};

module.exports = {
  fetchAuditLogs
};
