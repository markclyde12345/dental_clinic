const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const supabase = require('../config/db');
const { getCloudStore, setCloudStore } = require('./cloudStore');

const AUDIT_FILE = path.join(__dirname, '..', 'data', 'audit_logs.json');

// Ensure data directory and audit_logs.json exist (local dev only)
function ensureAuditFile() {
  if (process.env.VERCEL) return;
  try {
    const dir = path.dirname(AUDIT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(AUDIT_FILE)) {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (_) {}
}

/**
 * Log a sensitive staff or clinical financial action
 * @param {Object} entry
 */
async function logAuditAction(entry) {
  try {
    const { action, entityType, entityId, details, metadata = {}, req } = entry;

    let userId = entry.userId || entry.user_id || 'system';
    let userName = entry.userName || entry.user_name || 'System Auto';
    let userRole = entry.userRole || entry.user_role || 'System';
    let ipAddress = '127.0.0.1';
    let userAgent = 'Node/Server';

    if (req) {
      if (req.user) {
        userId = req.user.id || req.user._id || userId;
        userName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || userName;
        userRole = req.user.role || userRole;
      }
      ipAddress = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || ipAddress;
      userAgent = req.headers?.['user-agent'] || userAgent;
    }

    const logItem = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action,
      entity_type: entityType || entry.entity_type || 'system',
      entity_id: (entityId || entry.entity_id) ? String(entityId || entry.entity_id) : null,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      details: details || `${action} performed on ${entityType || 'record'} #${entityId || ''}`,
      metadata: metadata || {},
      ip_address: typeof ipAddress === 'string' ? ipAddress.replace(/^::ffff:/, '') : '127.0.0.1',
      user_agent: userAgent
    };

    console.log(`\x1b[36m[AUDIT LOG]\x1b[0m \x1b[1m${logItem.action}\x1b[0m by \x1b[33m${logItem.user_name} (${logItem.user_role})\x1b[0m: ${logItem.details}`);

    // In-memory caching
    if (!global._inMemoryAuditLogs) global._inMemoryAuditLogs = [];
    global._inMemoryAuditLogs.unshift(logItem);
    if (global._inMemoryAuditLogs.length > 500) global._inMemoryAuditLogs = global._inMemoryAuditLogs.slice(0, 500);

    // Persist in Supabase cloudStore so Vercel serverless instances share real-time audit logs
    try {
      const existingLogs = await getCloudStore('audit_logs', []);
      const logsArray = Array.isArray(existingLogs) ? existingLogs : [];
      logsArray.unshift(logItem);
      if (logsArray.length > 300) logsArray.length = 300;
      await setCloudStore('audit_logs', logsArray);
    } catch (cloudErr) {
      console.warn('[Audit CloudStore Warning]', cloudErr.message);
    }

    return logItem;
  } catch (err) {
    console.error('[Audit Logger Exception]', err.message);
    return null;
  }
}

/**
 * Retrieve recent audit logs with optional filters
 */
async function getAuditLogs(filters = {}) {
  const { limit = 100, action, entityType } = filters;

  try {
    let logs = await getCloudStore('audit_logs', []);
    if (!Array.isArray(logs)) logs = [];

    if (action && action !== 'ALL') {
      logs = logs.filter(l => l.action === action);
    }
    if (entityType) {
      logs = logs.filter(l => l.entity_type === entityType);
    }

    return logs.slice(0, limit).map(item => ({
      ...item,
      timestamp: item.created_at || item.timestamp
    }));
  } catch (err) {
    console.error('[Get Audit Logs Error]', err.message);
    return (global._inMemoryAuditLogs || []).slice(0, limit);
  }
}

module.exports = {
  logAuditAction,
  getAuditLogs
};
