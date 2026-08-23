const express = require('express');
const router = express.Router();
const { 
  getAdminStats, 
  getAdminAnalytics, 
  getDetailedStats, 
  getInventory, 
  addInventory,
  deleteInventory,
  getStaffSchedules,
  addStaffSchedule,
  deleteStaffSchedule,
  resetSeeder
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

router.get('/stats', protect, authorize('Admin'), getAdminStats);
router.get('/analytics', protect, authorize('Admin'), getAdminAnalytics);
router.get('/detailed-stats', protect, authorize('Admin'), getDetailedStats);
router.post('/reset-seeder', protect, authorize('Admin'), resetSeeder);

// Inventory routes
router.route('/inventory')
  .get(protect, authorize('Admin'), getInventory)
  .post(protect, authorize('Admin'), addInventory);

router.route('/inventory/:id')
  .delete(protect, authorize('Admin'), deleteInventory);

// Staff schedules routes
router.route('/staff-schedules')
  .get(protect, authorize('Admin'), getStaffSchedules)
  .post(protect, authorize('Admin'), addStaffSchedule);

router.route('/staff-schedules/:id')
  .delete(protect, authorize('Admin'), deleteStaffSchedule);

module.exports = router;
