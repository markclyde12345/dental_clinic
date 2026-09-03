const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/db');
const sendEmail = require('../utils/emailService');
const sendSMS = require('../utils/smsService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d',
    algorithm: 'HS256',
  });
};

const internalError = (res, error) => {
  console.error('[SERVER ERROR]', error);
  return res.status(500).json({ message: 'Something went wrong. Please try again.' });
};

// Asynchronous non-blocking backup for staff schedules to prevent latency during user creation
const asyncBackupStaffSchedules = () => {
  setImmediate(async () => {
    try {
      const DATA_DIR = process.env.DATA_DIR || '/tmp/dental_clinic_backups';
      const STAFF_FILE = path.join(DATA_DIR, 'staff_schedules.json');
      const BACKUP_DIR = path.join(DATA_DIR, 'backups');
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      const { data: fullList } = await supabase.from('staff_schedules').select('*').order('created_at', { ascending: true });
      if (fullList && fs.existsSync(BACKUP_DIR)) {
        fs.promises.writeFile(STAFF_FILE, JSON.stringify(fullList, null, 2)).catch(() => {});
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, `staff_schedules_backup_${timestamp}.json`);
        fs.promises.writeFile(backupPath, JSON.stringify(fullList, null, 2)).catch(() => {});
      }
    } catch (err) {
      console.error('[Async Staff Schedule Backup Error]', err.message);
    }
  });
};

// Map Supabase row (snake_case) → app user object (camelCase)
const mapUser = (row) => ({
  _id: row.id,
  id: row.id,
  firstName: row.first_name,
  lastName: row.last_name,
  name: row.name,
  email: row.email,
  role: row.role,
  contactNumber: row.contact_number,
  address: row.address,
  isActive: row.is_active,
  isVerified: row.is_verified,
});

// ─── Register ─────────────────────────────────────────────────────────────────
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { firstName, lastName, email, contactNumber, address, password } = req.body;
  try {
    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // Hash password with optimized salt rounds (fast & secure)
    const salt = await bcrypt.genSalt(8);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n🔑 [DEV OTP] Code for ${email} is: ${otp}\n`);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const fullName = `${firstName} ${lastName}`.trim();

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        email,
        contact_number: contactNumber,
        address,
        password: hashedPassword,
        role: 'Patient',
        is_verified: false,
        otp_code: otp,
        otp_expires: otpExpires,
        otp_attempts: 0
      }])
      .select('id, email')
      .single();

    if (insertError) {
      return internalError(res, insertError);
    }

    // Send OTP email (non-blocking)
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Verify your account — Fano Dental Clinic</title>
      </head>
      <body style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0b131e;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(11,60,77,0.06);">
          <tr>
            <td style="background-color: #0b3c4d; padding: 24px 32px; text-align: left;">
              <h1 style="color: #ffffff; font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 0.5px;">🦷 Fano Dental Clinic</h1>
              <p style="color: #c59b27; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Patient Portal Verification</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${fullName}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                Thank you for creating an account with Fano Dental Clinic. Please use the 6-digit verification code below to confirm your email and activate your account:
              </p>
              <div style="background-color: #eef6f8; border: 1px dashed #0b3c4d; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0b3c4d; display: inline-block;">${otp}</span>
              </div>
              <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 8px 0;">
                ⏱️ <strong>This code will expire in 10 minutes.</strong>
              </p>
              <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
                If you did not request this verification, you can safely ignore this email. Do not share this code with anyone.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">
                Fano Dental Clinic • Balirong Highway, City of Naga, Cebu • (032) 489-1200
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                © 2026 Fano Dental Clinic. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
    const emailText = `Hello ${fullName},\n\nThank you for signing up with Fano Dental Clinic.\nYour 6-digit verification code is: ${otp}\n\nThis code will expire in 10 minutes. Please do not share this code with anyone.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

    sendEmail(newUser.email, 'Your Verification Code: ' + otp + ' — Fano Dental Clinic', emailHtml, emailText).catch(err => {
      console.error('[Verification Email Error]', err);
    });

    return res.status(201).json({
      message: 'Registration successful. Verification required.',
      email: newUser.email,
      requireVerification: true
    });
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    const GENERIC_MSG = 'Invalid email or password.';

    if (error || !user) {
      return res.status(401).json({ message: GENERIC_MSG });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'Account is deactivated. Please contact support.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: GENERIC_MSG });
    }

    if (!user.is_verified) {
      // Generate new OTP for unverified users trying to log in
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      console.log(`\n🔑 [DEV OTP] Code for ${user.email} is: ${otp}\n`);
      const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await supabase.from('users').update({
        otp_code: otp,
        otp_expires: otpExpires,
        otp_attempts: 0
      }).eq('id', user.id);

      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Verify your account — Fano Dental Clinic</title>
        </head>
        <body style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0b131e;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(11,60,77,0.06);">
            <tr>
              <td style="background-color: #0b3c4d; padding: 24px 32px; text-align: left;">
                <h1 style="color: #ffffff; font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 0.5px;">🦷 Fano Dental Clinic</h1>
                <p style="color: #c59b27; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Patient Portal Verification</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${user.name}</strong>,</p>
                <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                  Your account requires email verification. Please use the 6-digit code below to complete your login:
                </p>
                <div style="background-color: #eef6f8; border: 1px dashed #0b3c4d; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0b3c4d; display: inline-block;">${otp}</span>
                </div>
                <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 8px 0;">
                  ⏱️ <strong>This code will expire in 10 minutes.</strong>
                </p>
                <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
                  If you did not request this verification, please secure your account.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #f1f5f9; text-align: center;">
                <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">
                  Fano Dental Clinic • Balirong Highway, City of Naga, Cebu • (032) 489-1200
                </p>
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                  © 2026 Fano Dental Clinic. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      const emailText = `Hello ${user.name},\n\nYour account requires verification.\nYour 6-digit verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

      sendEmail(user.email, 'Your Verification Code: ' + otp + ' — Fano Dental Clinic', emailHtml, emailText).catch(err => {
        console.error('[Verification Email Error]', err);
      });

      return res.status(403).json({
        message: 'Account not verified. A verification code has been sent to your email.',
        email: user.email,
        requireVerification: true
      });
    }

    const mapped = mapUser(user);
    return res.json({
      _id: mapped._id,
      name: mapped.name,
      email: mapped.email,
      role: mapped.role,
      token: generateToken(mapped._id),
    });
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Send OTP ─────────────────────────────────────────────────────────────────
// @route   POST /api/auth/send-otp
// @access  Public
const sendOTP = async (req, res) => {
  const { email, channel } = req.body;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!user || !user.is_active) {
      return res.json({ message: 'If this email is registered, a code will be sent.' });
    }

    // Enforce a 60-second cooldown
    if (user.otp_expires && (new Date(user.otp_expires) - Date.now()) > (9 * 60 * 1000)) {
      return res.status(429).json({ message: 'A code was recently sent. Please wait before requesting another.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n🔑 [DEV OTP] Code for ${email} is: ${otp}\n`);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('users').update({
      otp_code: otp,
      otp_expires: otpExpires,
      otp_attempts: 0
    }).eq('id', user.id);

    if (channel === 'sms') {
      if (!user.contact_number) {
        return res.status(400).json({ message: 'No phone number registered for this user.' });
      }
      const message = `Fano Dental Clinic: Your secure login code is ${otp}. Expires in 10 minutes. Do not share this code.`;
      const smsSuccess = await sendSMS(user.contact_number, message);
      if (!smsSuccess) {
        return res.status(500).json({ message: 'Failed to send SMS. Please try email instead.' });
      }
    } else {
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Your Verification Code — Fano Dental Clinic</title>
        </head>
        <body style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0b131e;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(11,60,77,0.06);">
            <tr>
              <td style="background-color: #0b3c4d; padding: 24px 32px; text-align: left;">
                <h1 style="color: #ffffff; font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 0.5px;">🦷 Fano Dental Clinic</h1>
                <p style="color: #c59b27; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Security Verification Code</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px;">
                <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${user.name}</strong>,</p>
                <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                  We received a request to verify your identity for your Fano Dental Clinic account. Please enter the following 6-digit verification code:
                </p>
                <div style="background-color: #eef6f8; border: 1px dashed #0b3c4d; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
                  <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0b3c4d; display: inline-block;">${otp}</span>
                </div>
                <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 8px 0;">
                  ⏱️ <strong>This code will expire in 10 minutes.</strong>
                </p>
                <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
                  If you did not initiate this request, someone may be trying to access your account. Please change your password immediately.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #f1f5f9; text-align: center;">
                <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">
                  Fano Dental Clinic • Balirong Highway, City of Naga, Cebu • (032) 489-1200
                </p>
                <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                  © 2026 Fano Dental Clinic. All rights reserved.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
      const emailText = `Hello ${user.name},\n\nYour security verification code for Fano Dental Clinic is: ${otp}\n\nThis code will expire in 10 minutes.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

      const emailSuccess = await sendEmail(user.email, 'Your Verification Code: ' + otp + ' — Fano Dental Clinic', emailHtml, emailText);
      if (!emailSuccess && process.env.NODE_ENV === 'production') {
        return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
      }
    }

    return res.json({ message: 'If this email is registered, a code will be sent.' });
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Verify OTP ───────────────────────────────────────────────────────────────
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOTP = async (req, res) => {
  const { email, otpCode } = req.body;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!user || !user.otp_code || !user.otp_expires) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    if (Date.now() > new Date(user.otp_expires)) {
      await supabase.from('users').update({
        otp_code: null,
        otp_expires: null,
        otp_attempts: 0
      }).eq('id', user.id);
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    // Brute-force protection
    const attempts = (user.otp_attempts || 0) + 1;
    if (attempts > 5) {
      await supabase.from('users').update({
        otp_code: null,
        otp_expires: null,
        otp_attempts: 0
      }).eq('id', user.id);
      return res.status(429).json({ message: 'Too many failed attempts. Please request a new code.' });
    }

    await supabase.from('users').update({ otp_attempts: attempts }).eq('id', user.id);

    if (user.otp_code !== otpCode) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    // Success — clear OTP and verify account
    await supabase.from('users').update({
      otp_code: null,
      otp_expires: null,
      otp_attempts: 0,
      is_verified: true
    }).eq('id', user.id);

    return res.json({
      _id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user.id),
    });
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Forgot Password — Send Reset OTP ────────────────────────────────────────
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    // Always return success to prevent email enumeration
    if (!user || !user.is_active) {
      return res.json({ message: 'If this email is registered, a reset code has been sent.' });
    }

    // Enforce a 60-second cooldown
    if (user.otp_expires && (new Date(user.otp_expires) - Date.now()) > (9 * 60 * 1000)) {
      return res.status(429).json({ message: 'A code was recently sent. Please wait before requesting another.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n🔑 [DEV RESET OTP] Code for ${email} is: ${otp}\n`);
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase.from('users').update({
      otp_code: otp,
      otp_expires: otpExpires,
      otp_attempts: 0
    }).eq('id', user.id);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Password Reset Code — Fano Dental Clinic</title>
      </head>
      <body style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0b131e;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(11,60,77,0.06);">
          <tr>
            <td style="background-color: #0b3c4d; padding: 24px 32px; text-align: left;">
              <h1 style="color: #ffffff; font-size: 20px; font-weight: bold; margin: 0; letter-spacing: 0.5px;">🦷 Fano Dental Clinic</h1>
              <p style="color: #c59b27; font-size: 12px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 1px;">Password Reset Request</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${user.name}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                We received a request to reset your password. Please use the 6-digit code below to proceed:
              </p>
              <div style="background-color: #eef6f8; border: 1px dashed #0b3c4d; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0b3c4d; display: inline-block;">${otp}</span>
              </div>
              <p style="font-size: 13px; line-height: 1.5; color: #64748b; margin: 0 0 8px 0;">
                ⏱️ <strong>This code will expire in 10 minutes.</strong>
              </p>
              <p style="font-size: 12px; line-height: 1.5; color: #94a3b8; margin: 0;">
                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">
                Fano Dental Clinic • Balirong Highway, City of Naga, Cebu • (032) 489-1200
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                © 2026 Fano Dental Clinic. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
    const emailText = `Hello ${user.name},\n\nWe received a request to reset your password.\nYour 6-digit reset code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, you can safely ignore this email.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

    sendEmail(user.email, 'Password Reset Code: ' + otp + ' — Fano Dental Clinic', emailHtml, emailText).catch(err => {
      console.error('[Password Reset Email Error]', err);
    });

    return res.json({ message: 'If this email is registered, a reset code has been sent.' });
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Forgot Password — Verify Reset OTP ──────────────────────────────────────
// @route   POST /api/auth/verify-reset-otp
// @access  Public
const verifyResetOTP = async (req, res) => {
  const { email, otpCode } = req.body;
  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (!user || !user.otp_code || !user.otp_expires) {
      return res.status(400).json({ message: 'Invalid or expired reset code.' });
    }

    if (Date.now() > new Date(user.otp_expires)) {
      await supabase.from('users').update({
        otp_code: null,
        otp_expires: null,
        otp_attempts: 0
      }).eq('id', user.id);
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }

    // Brute-force protection
    const attempts = (user.otp_attempts || 0) + 1;
    if (attempts > 5) {
      await supabase.from('users').update({
        otp_code: null,
        otp_expires: null,
        otp_attempts: 0
      }).eq('id', user.id);
      return res.status(429).json({ message: 'Too many failed attempts. Please request a new code.' });
    }

    await supabase.from('users').update({ otp_attempts: attempts }).eq('id', user.id);

    if (user.otp_code !== otpCode) {
      return res.status(400).json({ message: 'Invalid reset code.' });
    }

    // OTP is valid — generate a short-lived reset token (15 min)
    const resetToken = jwt.sign(
      { id: user.id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' }
    );

    // Clear OTP after successful verification
    await supabase.from('users').update({
      otp_code: null,
      otp_expires: null,
      otp_attempts: 0
    }).eq('id', user.id);

    return res.json({ message: 'Code verified. You may now reset your password.', resetToken });
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Forgot Password — Reset Password ────────────────────────────────────────
// @route   POST /api/auth/reset-password
// @access  Public (requires reset token)
const resetPassword = async (req, res) => {
  const { resetToken, newPassword } = req.body;
  try {
    if (!resetToken) {
      return res.status(400).json({ message: 'Reset token is required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(400).json({ message: 'Reset token is invalid or has expired. Please start over.' });
    }

    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ message: 'Invalid reset token.' });
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, is_active')
      .eq('id', decoded.id)
      .maybeSingle();

    if (!user || !user.is_active) {
      return res.status(400).json({ message: 'User account not found or is deactivated.' });
    }

    const salt = await bcrypt.genSalt(8);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await supabase.from('users').update({
      password: hashedPassword
    }).eq('id', user.id);

    return res.json({ message: 'Password has been reset successfully. You may now log in.' });
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Get Profile ──────────────────────────────────────────────────────────────
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, name, email, role, contact_number, address, is_active, is_verified, created_at')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json(mapUser(user));
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Admin: Get All Users ──────────────────────────────────────────────────────
// @route   GET /api/auth/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, name, email, role, contact_number, address, is_active, is_verified, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      return internalError(res, error);
    }
    return res.json(users);
  } catch (error) {
    return internalError(res, error);
  }
};

// ─── Admin: Create Staff User ──────────────────────────────────────────────────
// @route   POST /api/auth/users
// @access  Private (Admin)
const createStaffUser = async (req, res) => {
  const { firstName, lastName, email, contactNumber, address, password, role, dob, gender, bloodType, allergies, medicalNotes } = req.body;
  try {
    // Check if email already exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ message: 'User already exists.' });
    }

    // Hash password with optimized salt rounds (fast & secure)
    const salt = await bcrypt.genSalt(8);
    const hashedPassword = await bcrypt.hash(password || 'patient123', salt);
    const fullName = `${firstName} ${lastName}`.trim();
 
    // Enforce role restriction: Receptionist can only create Patients
    const assignedRole = req.user.role === 'Receptionist' ? 'Patient' : (role || 'Patient');

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        email,
        contact_number: contactNumber,
        address,
        password: hashedPassword,
        role: assignedRole,
        is_verified: true, // staff created is auto-verified
        is_active: true
      }])
      .select('id, email, name, role')
      .single();
 
    if (insertError) {
      return internalError(res, insertError);
    }
 
    if (role === 'Patient') {
      try {
        let allergiesArray = [];
        if (Array.isArray(allergies)) {
          allergiesArray = allergies;
        } else if (typeof allergies === 'string') {
          allergiesArray = allergies.split(',').map(a => a.trim()).filter(Boolean);
        }

        const { error: profileError } = await supabase
          .from('patient_profiles')
          .insert([{
            user_id: newUser.id,
            date_of_birth: dob,
            gender: gender || 'Male',
            blood_type: bloodType || 'O+',
            allergies: allergiesArray,
            medical_notes: medicalNotes || ''
          }]);

        if (profileError) throw profileError;
      } catch (err) {
        console.error('[Sync Patient Profile Error]', err.message);
      }
    } else {
      // Auto-create a corresponding shift schedule in staff_schedules if it is staff
      try {
        let shift = '08:00 AM - 05:00 PM';
        let availability = 'On Duty';
        let days = 'Mon - Sat';
  
        if (role === 'Dentist') {
          shift = '09:00 AM - 04:00 PM';
          days = 'Mon, Wed, Fri';
        } else if (role === 'Accounting') {
          shift = '08:00 AM - 05:00 PM';
          days = 'Tue, Thu, Sat';
        }
  
        const newSched = {
          id: newUser.id, // match user account ID
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          contact: contactNumber || 'N/A',
          shift,
          days,
          availability
        };
  
        const { error: schedError } = await supabase
          .from('staff_schedules')
          .insert([newSched]);
 
        if (schedError) throw schedError;
 
        // Trigger non-blocking async backup
        asyncBackupStaffSchedules();
      } catch (err) {
        console.error('[Sync Staff Schedule Error]', err.message);
      }
    }
 
    return res.status(201).json(newUser);
  } catch (error) {
    return internalError(res, error);
  }
};
 
 // ─── Admin: Toggle User Active Status ──────────────────────────────────────────
 // @route   PUT /api/auth/users/:id
 // @access  Private (Admin)
 const updateUserStatus = async (req, res) => {
   const { id } = req.params;
   const { isActive } = req.body;
   try {
     const { data: updated, error } = await supabase
       .from('users')
       .update({ is_active: isActive })
       .eq('id', id)
       .select('id, email, is_active')
       .single();
 
     if (error) {
       return internalError(res, error);
     }
     return res.json(updated);
   } catch (error) {
     return internalError(res, error);
   }
 };
 
 // ─── Admin: Delete User Account ────────────────────────────────────────────────
 // @route   DELETE /api/auth/users/:id
 // @access  Private (Admin)
 const deleteUser = async (req, res) => {
   const { id } = req.params;
   try {
     const { error } = await supabase
       .from('users')
       .delete()
       .eq('id', id);
 
     if (error) {
       // Check for foreign key constraint violation
       if (error.code === '23503') {
         return res.status(409).json({ 
           message: 'Cannot delete user because they have active billing or appointment records. Please deactivate their account instead.' 
         });
       }
       return internalError(res, error);
     }

     // Auto-remove corresponding shift schedule from staff_schedules if it exists
     try {
       const { error: schedError } = await supabase
         .from('staff_schedules')
         .delete()
         .eq('id', id);

       if (schedError) throw schedError;

       // Trigger non-blocking async backup
       asyncBackupStaffSchedules();
     } catch (err) {
       console.error('[Sync Staff Schedule Delete Error]', err.message);
     }
 
     return res.json({ success: true, message: 'User account deleted successfully' });
   } catch (error) {
     return internalError(res, error);
   }
 };
 
 module.exports = { registerUser, authUser, sendOTP, verifyOTP, forgotPassword, verifyResetOTP, resetPassword, getUserProfile, getAllUsers, createStaffUser, updateUserStatus, deleteUser };
