const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const supabase = require('../config/db');

const AUDIT_FILE = path.join(__dirname, '..', 'data', 'audit_logs.json');

// Ensure data directory and audit_logs.json exist
function ensureAuditFile() {
  const dir = path.dirname(AUDIT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(AUDIT_FILE)) {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

/**
 * Log a sensitive staff or clinical financial action
 * @param {Object} entry
 * @param {string} entry.action - Action type (e.g. PAYMENT_COLLECTED, INVOICE_WRITTEN_OFF, APPOINTMENT_CANCELLED)
 * @param {string} entry.entityType - Entity type ('invoice', 'appointment', 'patient')
 * @param {string} entry.entityId - Primary ID of the entity
 * @param {string} entry.details - Human-readable explanation of what occurred
 * @param {Object} [entry.metadata] - Key-value metadata
 * @param {Object} [entry.req] - Express request object (extracts user, IP, agent)
 */
async function logAuditAction(entry) {
  try {
    const { action, entityType, entityId, details, metadata = {}, req } = entry;

    let userId = entry.userId || 'system';
    let userName = entry.userName || 'System Auto';
    let userRole = entry.userRole || 'System';
    let ipAddress = '127.0.0.1';
    let userAgent = 'Node/Server';

    if (req) {
      if (req.user) {
        userId = req.user.id || req.user._id || userId;
        userName = req.user.name || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email || userName;
        userRole = req.user.role || userRole;
      }
      ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || ipAddress;
      userAgent = req.headers['user-agent'] || userAgent;
    }

    const logItem = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      details: details || `${action} performed on ${entityType} #${entityId}`,
      metadata: metadata || {},
      ip_address: typeof ipAddress === 'string' ? ipAddress.replace(/^::ffff:/, '') : '127.0.0.1',
      user_agent: userAgent
    };

    console.log(`\x1b[36m[AUDIT LOG]\x1b[0m \x1b[1m${logItem.action}\x1b[0m by \x1b[33m${logItem.user_name} (${logItem.user_role})\x1b[0m: ${logItem.details}`);

    // 1. Attempt writing to Supabase audit_logs table
    try {
      const { error } = await supabase.from('audit_logs').insert([{
        id: logItem.id,
        user_id: logItem.user_id !== 'system' ? logItem.user_id : null,
        user_name: logItem.user_name,
        user_role: logItem.user_role,
        action: logItem.action,
        entity_type: logItem.entity_type,
        entity_id: logItem.entity_id,
        details: logItem.details,
        metadata: logItem.metadata,
        ip_address: logItem.ip_address,
        created_at: logItem.timestamp
      }]);

      if (error && error.code !== 'PGRST205') {
        console.warn('[Audit Supabase Notice]', error.message);
      }
    } catch (_) {}

    // 2. Persist to local JSON data store as primary/fallback audit trail
    try {
      ensureAuditFile();
      const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
      let logs = [];
      try {
        logs = JSON.parse(raw);
        if (!Array.isArray(logs)) logs = [];
      } catch (e) {
        logs = [];
      }

      logs.unshift(logItem);
      // Keep last 1,000 logs in JSON file to prevent unbounded growth
      if (logs.length > 1000) logs = logs.slice(0, 1000);

      fs.writeFileSync(AUDIT_FILE, JSON.stringify(logs, null, 2), 'utf8');
    } catch (fsErr) {
      console.error('[Audit File Save Error]', fsErr.message);
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

  // 1. Try fetching from Supabase first
  try {
    let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (action && action !== 'ALL') query = query.eq('action', action);
    if (entityType) query = query.eq('entity_type', entityType);

    const { data, error } = await query;
    if (!error && Array.isArray(data) && data.length > 0) {
      return data.map(item => ({
        ...item,
        timestamp: item.created_at || item.timestamp
      }));
    }
  } catch (_) {}

  // 2. Fallback to reading from local JSON store
  try {
    ensureAuditFile();
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8');
    let logs = JSON.parse(raw);
    if (!Array.isArray(logs)) return [];

    if (action && action !== 'ALL') {
      logs = logs.filter(l => l.action === action);
    }
    if (entityType) {
      logs = logs.filter(l => l.entity_type === entityType);
    }

    return logs.slice(0, limit);
  } catch (err) {
    console.error('[Get Audit Logs Error]', err.message);
    return [];
  }
}

module.exports = {
  logAuditAction,
  getAuditLogs
};
