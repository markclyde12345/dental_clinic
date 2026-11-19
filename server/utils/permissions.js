const { getCloudStore, setCloudStore } = require('./cloudStore');

// Roles whose access the Admin can configure. Admin always has full access; Patients are excluded.
const CONFIGURABLE_ROLES = ['Receptionist', 'Dentist', 'Accounting'];
const STAFF_ROLES = ['Receptionist', 'Dentist', 'Accounting', 'Assistant'];

// Permission catalog. `defaultRoles` mirrors the access each route had before
// this feature existed, so nothing changes until the Admin edits it.
const PERMISSIONS = [
  { key: 'admin.access',     group: 'Administration', label: 'Grant Admin Privileges',     description: 'Allow this specific staff account elevated administrative permissions across clinic modules.', defaultRoles: [], userOnly: true },
  { key: 'invoice.create',   group: 'Billing',        label: 'Create invoices',            description: 'Issue new patient invoices.',                          defaultRoles: ['Accounting'] },
  { key: 'invoice.collect',  group: 'Billing',        label: 'Collect payments',           description: 'Record cash, e-wallet, or card payments on invoices.', defaultRoles: ['Accounting', 'Receptionist'] },
  { key: 'invoice.writeoff', group: 'Billing',        label: 'Write off overdue invoices', description: 'Mark overdue invoices as uncollectible bad debt.',     defaultRoles: ['Accounting'] },
  { key: 'invoice.void',     group: 'Billing',        label: 'Void invoices',              description: 'Cancel an issued invoice.',                            defaultRoles: ['Accounting'] },
  { key: 'inventory.edit',   group: 'Inventory',      label: 'Add / update inventory',     description: 'Add supply items or update stock levels.',             defaultRoles: ['Receptionist'] },
  { key: 'history.export',   group: 'Records',        label: 'Export visit history (CSV)', description: 'Download patient visit history as a CSV file.',        defaultRoles: ['Receptionist'] },
];

const VALID_KEYS = new Set(PERMISSIONS.map((p) => p.key));
const STORE_KEY = 'role_permissions';

function defaultMatrix() {
  const matrix = {};
  for (const role of CONFIGURABLE_ROLES) {
    matrix[role] = {};
    for (const p of PERMISSIONS) {
      if (!p.userOnly) matrix[role][p.key] = p.defaultRoles.includes(role);
    }
  }
  return matrix;
}

async function getPermissionStore() {
  const raw = (await getCloudStore(STORE_KEY, null).catch(() => null)) || {};
  // Support both legacy flat format ({ Receptionist: {...} }) and new format ({ roles: {...}, users: {...} })
  const storedRoles = (raw && typeof raw.roles === 'object') ? raw.roles : raw;
  const storedUsers = (raw && typeof raw.users === 'object' && raw.users !== null) ? raw.users : {};

  const matrix = defaultMatrix();
  for (const role of CONFIGURABLE_ROLES) {
    for (const p of PERMISSIONS) {
      if (!p.userOnly && storedRoles[role] && typeof storedRoles[role][p.key] === 'boolean') {
        matrix[role][p.key] = storedRoles[role][p.key];
      }
    }
  }

  const userOverrides = {};
  for (const [uid, perms] of Object.entries(storedUsers)) {
    if (!perms || typeof perms !== 'object') continue;
    const clean = {};
    for (const [k, v] of Object.entries(perms)) {
      if (VALID_KEYS.has(k) && typeof v === 'boolean') clean[k] = v;
    }
    if (Object.keys(clean).length > 0) userOverrides[String(uid)] = clean;
  }

  return { matrix, userOverrides };
}

async function getPermissionMatrix() {
  const { matrix } = await getPermissionStore();
  return matrix;
}

async function savePermissionStore({ matrix: inputMatrix, userOverrides: inputUsers }) {
  const current = await getPermissionStore();

  if (inputMatrix && typeof inputMatrix === 'object') {
    for (const role of CONFIGURABLE_ROLES) {
      if (typeof inputMatrix[role] !== 'object') continue;
      for (const p of PERMISSIONS) {
        if (!p.userOnly && typeof inputMatrix[role][p.key] === 'boolean') {
          current.matrix[role][p.key] = inputMatrix[role][p.key];
        }
      }
    }
  }

  if (inputUsers && typeof inputUsers === 'object') {
    for (const [uid, perms] of Object.entries(inputUsers)) {
      const cleanId = String(uid || '').trim();
      if (!cleanId) continue;
      if (perms === null) {
        delete current.userOverrides[cleanId];
        continue;
      }
      if (typeof perms !== 'object') continue;
      const clean = {};
      for (const [k, v] of Object.entries(perms)) {
        if (VALID_KEYS.has(k) && typeof v === 'boolean') clean[k] = v;
      }
      if (Object.keys(clean).length > 0) current.userOverrides[cleanId] = clean;
      else delete current.userOverrides[cleanId];
    }
  }

  await setCloudStore(STORE_KEY, { roles: current.matrix, users: current.userOverrides });
  return current;
}

async function savePermissionMatrix(input) {
  const res = await savePermissionStore({ matrix: input });
  return res.matrix;
}

async function getEffectivePermissions(userOrRole) {
  const role = typeof userOrRole === 'string' ? userOrRole : (userOrRole && userOrRole.role);
  const userId = typeof userOrRole === 'object' && userOrRole ? String(userOrRole.id || userOrRole._id || '') : '';
  const { matrix, userOverrides } = await getPermissionStore();
  const override = userId ? (userOverrides[userId] || null) : null;

  const effective = {};
  for (const p of PERMISSIONS) {
    if (role === 'Admin') {
      effective[p.key] = true;
    } else if (!STAFF_ROLES.includes(role)) {
      effective[p.key] = false;
    } else if (override && override['admin.access'] === true) {
      effective[p.key] = true;
    } else if (override && typeof override[p.key] === 'boolean') {
      effective[p.key] = override[p.key];
    } else {
      effective[p.key] = !!(matrix[role] && matrix[role][p.key]);
    }
  }
  return effective;
}

async function hasPermission(userOrRole, key) {
  const role = typeof userOrRole === 'string' ? userOrRole : (userOrRole && userOrRole.role);
  if (role === 'Admin') return true;
  if (!STAFF_ROLES.includes(role)) return false;
  const effective = await getEffectivePermissions(userOrRole);
  return !!effective[key];
}

// Express middleware — use after `protect`.
const requirePermission = (key) => async (req, res, next) => {
  try {
    if (req.user && await hasPermission(req.user, key)) return next();
    return res.status(403).json({ message: 'You do not have permission to perform this action. Ask the clinic admin to grant access.' });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  CONFIGURABLE_ROLES,
  STAFF_ROLES,
  PERMISSIONS,
  getPermissionStore,
  getPermissionMatrix,
  savePermissionStore,
  savePermissionMatrix,
  getEffectivePermissions,
  hasPermission,
  requirePermission,
};
