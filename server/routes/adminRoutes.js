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
  clearSystemLogs
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats', protect, authorize('Admin'), getAdminStats);
router.get('/analytics', protect, authorize('Admin'), getAdminAnalytics);
router.get('/detailed-stats', protect, authorize('Admin'), getDetailedStats);
router.post('/reset-seeder', protect, authorize('Admin'), resetSeeder);

// System Logs routes
router.route('/logs')
  .get(protect, authorize('Admin'), getSystemLogs)
  .post(protect, authorize('Admin'), addSystemLog)
  .delete(protect, authorize('Admin'), clearSystemLogs);

// Inventory routes — Accounting can read for cost analysis; only Admin can modify
router.route('/inventory')
  .get(protect, authorize('Admin', 'Accounting'), getInventory)
  .post(protect, authorize('Admin'), addInventory);

router.route('/inventory/:id')
  .put(protect, authorize('Admin'), updateInventory)
  .delete(protect, authorize('Admin'), deleteInventory);

// Staff schedules routes
router.route('/staff-schedules')
  .get(protect, authorize('Admin', 'Receptionist', 'Dentist'), getStaffSchedules)
  .post(protect, authorize('Admin'), addStaffSchedule);

router.route('/staff-schedules/:id')
  .put(protect, authorize('Admin'), updateStaffSchedule)
  .delete(protect, authorize('Admin'), deleteStaffSchedule);

module.exports = router;
