const { body, validationResult } = require('express-validator');

// ─── Reusable validator runner ────────────────────────────────────────────────
const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: errors.array()[0].msg, // return first error only (don't leak too much)
    });
  }
  next();
};

// ─── Register validation rules ────────────────────────────────────────────────
const validateRegister = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required.')
    .isLength({ min: 2, max: 40 }).withMessage('First name must be between 2 and 40 characters.')
    .matches(/^[a-zA-Z\s\-'.]+$/).withMessage('First name contains invalid characters.'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required.')
    .isLength({ min: 2, max: 40 }).withMessage('Last name must be between 2 and 40 characters.')
    .matches(/^[a-zA-Z\s\-'.]+$/).withMessage('Last name contains invalid characters.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/\d/).withMessage('Password must contain at least one number.')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Password must contain at least one special character.'),

  body('role')
    .optional()
    .isIn(['Admin', 'Receptionist', 'Dental Assistant', 'Dentist', 'Patient', 'Accounting'])
    .withMessage('Invalid role specified.'),

  body('contactNumber')
    .optional()
    .trim()
    .matches(/^\+?[\d\s\-().]{7,20}$/).withMessage('Invalid contact number format.'),

  runValidation,
];

// ─── Login validation rules ───────────────────────────────────────────────────
const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.'),

  runValidation,
];

// ─── OTP send validation ──────────────────────────────────────────────────────
const validateSendOTP = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('channel')
    .optional()
    .isIn(['email', 'sms']).withMessage('Channel must be "email" or "sms".'),

  runValidation,
];

// ─── OTP verify validation ────────────────────────────────────────────────────
const validateVerifyOTP = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('otpCode')
    .trim()
    .notEmpty().withMessage('OTP code is required.')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.')
    .isNumeric().withMessage('OTP must contain only digits.'),

  runValidation,
];

// ─── Forgot Password validation ──────────────────────────────────────────────
const validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  runValidation,
];

// ─── Verify Reset OTP validation ─────────────────────────────────────────────
const validateVerifyResetOTP = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('otpCode')
    .trim()
    .notEmpty().withMessage('OTP code is required.')
    .isLength({ min: 6, max: 6 }).withMessage('OTP must be exactly 6 digits.')
    .isNumeric().withMessage('OTP must contain only digits.'),

  runValidation,
];

// ─── Reset Password validation ───────────────────────────────────────────────
const validateResetPassword = [
  body('resetToken')
    .trim()
    .notEmpty().withMessage('Reset token is required.'),

  body('newPassword')
    .notEmpty().withMessage('New password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
    .matches(/\d/).withMessage('Password must contain at least one number.')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Password must contain at least one special character.'),

  runValidation,
];

module.exports = { validateRegister, validateLogin, validateSendOTP, validateVerifyOTP, validateForgotPassword, validateVerifyResetOTP, validateResetPassword };
