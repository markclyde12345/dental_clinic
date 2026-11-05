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
  .post(protect, authorize('Admin', 'Receptionist'), addInventory);

router.route('/inventory/:id')
  .put(protect, authorize('Admin', 'Receptionist'), updateInventory)
  .delete(protect, authorize('Admin'), deleteInventory);

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
router.get('/history-export', protect, authorize('Admin', 'Receptionist'), exportHistoryCSV);

module.exports = router;

