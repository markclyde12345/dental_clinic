const { getAuditLogs } = require('../utils/auditLogger');

// @desc    Get audit logs
// @route   GET /api/audit-logs
// @access  Private (Receptionist, Admin)
const fetchAuditLogs = async (req, res) => {
  try {
    const { limit = 50, action, entityType } = req.query;
    let logs = await getAuditLogs({
      limit: parseInt(limit, 10) || 50,
      action,
      entityType
    });

    // If requester is a Receptionist, filter out internal security/auth/MFA/admin-system events
    if (req.user && req.user.role === 'Receptionist') {
      const authKeywords = ['LOGIN', 'LOGOUT', 'MFA', 'TOTP', 'BACKUP_CODE', 'ACCOUNT_LOCKED', 'PASSWORD', 'SECURITY'];
      logs = logs.filter(item => {
        const act = (item.action || '').toUpperCase();
        const entity = (item.entity_type || '').toLowerCase();
        // Hide all authentication and security events
        if (authKeywords.some(kw => act.includes(kw))) return false;
        // Hide admin user management / system operations from receptionists
        if (item.user_role === 'Admin' && (entity === 'user' || entity === 'system' || !['appointment', 'invoice', 'payment', 'treatment', 'patient'].includes(entity))) {
          return false;
        }
        return true;
      });
    }

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
