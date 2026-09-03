const express = require('express');
const router = express.Router();
const { registerUser, authUser, sendOTP, verifyOTP, forgotPassword, verifyResetOTP, resetPassword, getUserProfile, getAllUsers, createStaffUser, updateUserStatus, deleteUser } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { validateRegister, validateLogin, validateSendOTP, validateVerifyOTP, validateForgotPassword, validateVerifyResetOTP, validateResetPassword } = require('../middleware/validate');

router.post('/register', validateRegister, registerUser);
router.post('/login',    validateLogin,    authUser);
router.post('/send-otp', validateSendOTP,  sendOTP);
router.post('/verify-otp', validateVerifyOTP, verifyOTP);
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/verify-reset-otp', validateVerifyResetOTP, verifyResetOTP);
router.post('/reset-password', validateResetPassword, resetPassword);
router.get('/profile', protect, getUserProfile);

// User Management Routes
router.route('/users')
  .get(protect, authorize('Admin', 'Receptionist'), getAllUsers)
  .post(protect, authorize('Admin', 'Receptionist'), createStaffUser);

router.route('/users/:id')
  .put(protect, authorize('Admin'), updateUserStatus)
  .delete(protect, authorize('Admin'), deleteUser);

module.exports = router;
