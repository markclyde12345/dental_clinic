const express = require('express');
const router = express.Router();
const { registerUser, authUser, sendOTP, verifyOTP, getUserProfile, getAllUsers, createStaffUser, updateUserStatus, deleteUser } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { validateRegister, validateLogin, validateSendOTP, validateVerifyOTP } = require('../middleware/validate');

router.post('/register', validateRegister, registerUser);
router.post('/login',    validateLogin,    authUser);
router.post('/send-otp', validateSendOTP,  sendOTP);
router.post('/verify-otp', validateVerifyOTP, verifyOTP);
router.get('/profile', protect, getUserProfile);

// Admin-only User Management Routes
router.route('/users')
  .get(protect, authorize('Admin'), getAllUsers)
  .post(protect, authorize('Admin'), createStaffUser);

router.route('/users/:id')
  .put(protect, authorize('Admin'), updateUserStatus)
  .delete(protect, authorize('Admin'), deleteUser);

module.exports = router;
