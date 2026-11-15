const { getCloudStore, setCloudStore } = require('./cloudStore');

// Roles whose access the Admin can configure. Admin always has full access; Patients are excluded.
const CONFIGURABLE_ROLES = ['Receptionist', 'Dentist', 'Accounting'];

// Permission catalog. `defaultRoles` mirrors the access each route had before
// this feature existed, so nothing changes until the Admin edits it.
const PERMISSIONS = [
  { key: 'invoice.create',   group: 'Billing',   label: 'Create invoices',              description: 'Issue new patient invoices.',                          defaultRoles: ['Accounting'] },
  { key: 'invoice.collect',  group: 'Billing',   label: 'Collect payments',             description: 'Record cash, e-wallet, or card payments on invoices.', defaultRoles: ['Accounting', 'Receptionist'] },
  { key: 'invoice.writeoff', group: 'Billing',   label: 'Write off overdue invoices',   description: 'Mark overdue invoices as uncollectible bad debt.',     defaultRoles: ['Accounting'] },
  { key: 'invoice.void',     group: 'Billing',   label: 'Void invoices',                description: 'Cancel an issued invoice.',                            defaultRoles: ['Accounting'] },
  { key: 'inventory.edit',   group: 'Inventory', label: 'Add / update inventory',       description: 'Add supply items or update stock levels.',             defaultRoles: ['Receptionist'] },
  { key: 'history.export',   group: 'Records',   label: 'Export visit history (CSV)',   description: 'Download patient visit history as a CSV file.',        defaultRoles: ['Receptionist'] },
];

const STORE_KEY = 'role_permissions';

function defaultMatrix() {
  const matrix = {};
  for (const role of CONFIGURABLE_ROLES) {
    matrix[role] = {};
    for (const p of PERMISSIONS) matrix[role][p.key] = p.defaultRoles.includes(role);
  }
  return matrix;
}

// Merge stored values over defaults so newly added permissions get sane defaults.
async function getPermissionMatrix() {
  const stored = (await getCloudStore(STORE_KEY, null).catch(() => null)) || {};
  const matrix = defaultMatrix();
  for (const role of CONFIGURABLE_ROLES) {
    for (const p of PERMISSIONS) {
      if (stored[role] && typeof stored[role][p.key] === 'boolean') {
        matrix[role][p.key] = stored[role][p.key];
      }
    }
  }
  return matrix;
}

// Only accepts known roles / keys / booleans from the client.
async function savePermissionMatrix(input) {
  const matrix = await getPermissionMatrix();
  for (const role of CONFIGURABLE_ROLES) {
    if (!input || typeof input[role] !== 'object') continue;
    for (const p of PERMISSIONS) {
      if (typeof input[role][p.key] === 'boolean') matrix[role][p.key] = input[role][p.key];
    }
  }
  await setCloudStore(STORE_KEY, matrix);
  return matrix;
}

async function hasPermission(role, key) {
  if (role === 'Admin') return true;
  if (!CONFIGURABLE_ROLES.includes(role)) return false;
  const matrix = await getPermissionMatrix();
  return !!(matrix[role] && matrix[role][key]);
}

// Express middleware — use after `protect`.
const requirePermission = (key) => async (req, res, next) => {
  try {
    if (req.user && await hasPermission(req.user.role, key)) return next();
    return res.status(403).json({ message: 'You do not have permission to perform this action. Ask the clinic admin to grant access.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  CONFIGURABLE_ROLES,
  PERMISSIONS,
  getPermissionMatrix,
  savePermissionMatrix,
  hasPermission,
  requirePermission,
};
