const express = require('express');
const router = express.Router();
const { 
  getAdminStats, 
  getAdminAnalytics, 
  getDetailedStats, 
  getInventory, 
  addInventory,
  updateInventory,
  deleteInventory,
  notifyInventorySupplier,
  getStaffSchedules, 
  addStaffSchedule,
  updateStaffSchedule,
  deleteStaffSchedule,
  resetSeeder,
  getSystemLogs,
  addSystemLog,
  clearSystemLogs,
  getDatabaseStatus,
  triggerDatabaseBackup,
  getMfaConfig,
  updateMfaConfig,
  sendTestMfa,
  revokeMfaDevices,
  setupTotp,
  verifyTotpSetup,
  disableTotp,
  getTotpStatus,
  regenerateBackupCodes,
  getVisitsHistory,
  addVisitRecord,
  updateVisitRecord,
  archiveVisitRecord,
  checkInVisit,
  checkOutVisit,
  getPersonTimeline,
  exportHistoryCSV,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const { logAuditAction } = require('../utils/auditLogger');
const {
  CONFIGURABLE_ROLES,
  STAFF_ROLES,
  PERMISSIONS,
  getPermissionStore,
  savePermissionStore,
  getEffectivePermissions,
  requirePermission,
} = require('../utils/permissions');
const supabase = require('../config/db');

// ─── Staff & Role Permissions (Admin grants specific access per staff user or role) ──
const permissionCatalog = PERMISSIONS.map(({ key, group, label, description, userOnly }) => ({ key, group, label, description, userOnly: !!userOnly }));

router.route('/permissions')
  .get(protect, authorize('Admin'), async (req, res) => {
    try {
      const [{ matrix, userOverrides }, usersRes] = await Promise.all([
        getPermissionStore(),
        supabase
          .from('users')
          .select('id, name, first_name, last_name, email, role, is_active')
          .in('role', STAFF_ROLES)
          .order('name', { ascending: true })
      ]);
      const staffUsers = (usersRes.data || [])
        .filter((u) => u.role && u.role !== 'Patient' && u.role !== 'Admin')
        .map((u) => ({
          id: u.id,
          name: u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email,
          email: u.email,
          role: u.role,
          is_active: u.is_active !== false
        }));
      res.json({ roles: CONFIGURABLE_ROLES, permissions: permissionCatalog, matrix, userOverrides, staffUsers });
    } catch (err) { res.status(500).json({ message: err.message }); }
  })
  .put(protect, authorize('Admin'), async (req, res) => {
    try {
      const { matrix: inMatrix, userOverrides: inUsers } = req.body || {};
      const updated = await savePermissionStore({ matrix: inMatrix, userOverrides: inUsers });
      console.log(`[Permissions] ${req.user?.name || 'Admin'} updated staff/role permissions`);
      logAuditAction({
        action: 'PERMISSION_CHANGED',
        entityType: 'permissions',
        entityId: inUsers ? 'staff_user_access' : 'role_matrix',
        details: `${req.user?.name || 'Admin'} updated staff/role access permissions`,
        metadata: { updatedUsers: inUsers ? Object.keys(inUsers) : [] },
        req
      });
      res.json({ message: 'Access permissions updated.', matrix: updated.matrix, userOverrides: updated.userOverrides });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

// Any logged-in staff member can read their own effective permissions (user override + role default).
router.get('/permissions/me', protect, async (req, res) => {
  try {
    const permissions = await getEffectivePermissions(req.user);
    res.json({ role: req.user.role, permissions });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/stats', protect, authorize('Admin'), getAdminStats);
router.get('/analytics', protect, authorize('Admin'), getAdminAnalytics);
router.get('/detailed-stats', protect, authorize('Admin'), getDetailedStats);
router.post('/reset-seeder', protect, authorize('Admin'), resetSeeder);

// Admin Multi-Factor Authentication (MFA) Security Routes
router.route('/mfa-config')
  .get(protect, authorize('Admin'), getMfaConfig)
  .put(protect, authorize('Admin'), updateMfaConfig);

router.post('/mfa-test', protect, authorize('Admin'), sendTestMfa);
router.post('/mfa-revoke-devices', protect, authorize('Admin'), revokeMfaDevices);

// Admin TOTP (Authenticator App) Routes
router.post('/totp/setup', protect, authorize('Admin'), setupTotp);
router.post('/totp/verify-setup', protect, authorize('Admin'), verifyTotpSetup);
router.post('/totp/disable', protect, authorize('Admin'), disableTotp);
router.get('/totp/status', protect, authorize('Admin'), getTotpStatus);
router.post('/totp/regenerate-backup-codes', protect, authorize('Admin'), regenerateBackupCodes);

// Database Health & Backup routes
router.get('/database-status', protect, authorize('Admin'), getDatabaseStatus);
router.post('/trigger-backup', protect, authorize('Admin'), triggerDatabaseBackup);

// System Logs routes
router.route('/logs')
  .get(protect, authorize('Admin'), getSystemLogs)
  .post(protect, authorize('Admin'), addSystemLog)
  .delete(protect, authorize('Admin'), clearSystemLogs);

// Inventory routes — Accounting can read for cost analysis; Receptionist can report low stock; Admin full access
router.route('/inventory')
  .get(protect, authorize('Admin', 'Accounting', 'Receptionist'), getInventory)
  .post(protect, requirePermission('inventory.edit'), addInventory);

router.route('/inventory/:id')
  .put(protect, requirePermission('inventory.edit'), updateInventory)
  .delete(protect, authorize('Admin'), deleteInventory);

router.post('/inventory/:id/order-notify', protect, authorize('Admin', 'Accounting', 'Receptionist'), notifyInventorySupplier);

// Staff schedules routes
router.route('/staff-schedules')
  .get(protect, authorize('Admin', 'Receptionist', 'Dentist'), getStaffSchedules)
  .post(protect, authorize('Admin'), addStaffSchedule);

router.route('/staff-schedules/:id')
  .put(protect, authorize('Admin', 'Receptionist', 'Dentist'), updateStaffSchedule)
  .delete(protect, authorize('Admin'), deleteStaffSchedule);


// ─── History / Visits Management Routes ──────────────────────────────────────
router.route('/history')
  .get(protect, authorize('Admin', 'Receptionist', 'Dentist'), getVisitsHistory)
  .post(protect, authorize('Admin', 'Receptionist'), addVisitRecord);

// Person timeline MUST come BEFORE /:id to avoid route conflict
router.get('/history/person/:patientId', protect, authorize('Admin', 'Receptionist', 'Dentist'), getPersonTimeline);

router.route('/history/:id')
  .put(protect, authorize('Admin', 'Receptionist'), updateVisitRecord);

router.patch('/history/:id/archive', protect, authorize('Admin'), archiveVisitRecord);
router.patch('/history/:id/checkin',  protect, authorize('Admin', 'Receptionist'), checkInVisit);
router.patch('/history/:id/checkout', protect, authorize('Admin', 'Receptionist'), checkOutVisit);
router.get('/history-export', protect, requirePermission('history.export'), exportHistoryCSV);

module.exports = router;

