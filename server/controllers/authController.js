const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/db');
const sendEmail = require('../utils/emailService');
const sendSMS = require('../utils/smsService');
const { logAuditAction } = require('../utils/auditLogger');

// ─── Brute-Force & Lockout Protection ─────────────────────────────────────────
// Map: email -> { count: number, lockedUntil: number | null }
const loginAttemptTracker = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15-minute lockout

// ─── Helpers ──────────────────────────────────────────────────────────────────
const OTP_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30-day OTP validity

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
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanFirst = (firstName || '').trim();
    const cleanLast = (lastName || '').trim();
    const fullName = `${cleanFirst} ${cleanLast}`.trim();
    const cleanPhone = (contactNumber || '').replace(/[\s\-\(\)\.]/g, '').trim();

    if (!cleanEmail) {
      return res.status(400).json({ message: 'Email address is required.', field: 'email' });
    }

    // 1. Check if email already exists (case-insensitive)
    const { data: existingEmails } = await supabase
      .from('users')
      .select('id, name, email')
      .ilike('email', cleanEmail)
      .limit(1);

    const existingEmail = existingEmails && existingEmails.length > 0 ? existingEmails[0] : null;

    if (existingEmail) {
      return res.status(400).json({
        message: `The email address "${cleanEmail}" is already registered. Please log in or use a different email.`,
        field: 'email'
      });
    }

    // 2. Check if contact number already exists
    if (cleanPhone) {
      const altPhone = cleanPhone.startsWith('+63')
        ? '0' + cleanPhone.slice(3)
        : (cleanPhone.startsWith('0') ? '+63' + cleanPhone.slice(1) : cleanPhone);

      const { data: existingPhones } = await supabase
        .from('users')
        .select('id, name, email, contact_number')
        .or(`contact_number.eq.${cleanPhone},contact_number.eq.${altPhone}`)
        .limit(1);

      const existingPhone = existingPhones && existingPhones.length > 0 ? existingPhones[0] : null;

      if (existingPhone) {
        return res.status(400).json({
          message: `The contact number "${contactNumber}" is already in use by another user (${existingPhone.name}). Please log in or use a different number.`,
          field: 'contactNumber'
        });
      }
    }

    // 3. Check if a user with the exact same name already exists
    if (fullName) {
      const { data: existingNames } = await supabase
        .from('users')
        .select('id, name, email, contact_number')
        .ilike('name', fullName)
        .limit(1);

      const existingName = existingNames && existingNames.length > 0 ? existingNames[0] : null;

      if (existingName) {
        return res.status(400).json({
          message: `A user account named "${fullName}" is already registered (${existingName.email}). If this is you, please log in.`,
          field: 'name'
        });
      }
    }

    // Hash password with optimized salt rounds (fast & secure)
    const salt = await bcrypt.genSalt(8);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP (valid for 30 days)
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n🔑 [DEV OTP] Code for ${cleanEmail} is: ${otp} (valid for 30 days)\n`);
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        first_name: cleanFirst,
        last_name: cleanLast,
        name: fullName,
        email: cleanEmail,
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
                ⏱️ <strong>This code is valid for 30 days.</strong>
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
    const emailText = `Hello ${fullName},\n\nThank you for signing up with Fano Dental Clinic.\nYour 6-digit verification code is: ${otp}\n\nThis code is valid for 30 days. Please do not share this code with anyone.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

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
  const normalizedEmail = (email || '').trim().toLowerCase();

  try {
    // 1. Check if account is currently locked due to failed attempts
    const lockRecord = loginAttemptTracker.get(normalizedEmail);
    if (lockRecord && lockRecord.lockedUntil) {
      if (lockRecord.lockedUntil > Date.now()) {
        const minutesRemaining = Math.max(1, Math.ceil((lockRecord.lockedUntil - Date.now()) / (60 * 1000)));
        return res.status(429).json({
          field: 'password',
          message: `Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in ${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}.`,
          isLocked: true,
          lockedUntil: new Date(lockRecord.lockedUntil).toISOString()
        });
      } else {
        // Lockout expired, reset counter
        loginAttemptTracker.delete(normalizedEmail);
      }
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    // If account doesn't exist, do NOT count an attempt against lockout
    if (error || !user) {
      return res.status(401).json({
        field: 'email',
        message: 'No account found with this email address.'
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        field: 'email',
        message: 'Account is deactivated. Please contact support.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // User exists, but password was incorrect: count this attempt
      const current = loginAttemptTracker.get(normalizedEmail) || { count: 0, lockedUntil: null };
      current.count += 1;

      if (current.count >= MAX_FAILED_ATTEMPTS) {
        current.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
        loginAttemptTracker.set(normalizedEmail, current);

        logAuditAction({
          action: 'ACCOUNT_LOCKED',
          entityType: 'user',
          entityId: user.id,
          details: `Account lock triggered for ${normalizedEmail} after ${current.count} failed login attempts.`,
          metadata: { email: normalizedEmail, attempts: current.count, lockedUntil: new Date(current.lockedUntil).toISOString() },
          req,
          userName: user.name,
          userRole: user.role
        }).catch(() => {});

        return res.status(429).json({
          field: 'password',
          message: 'Account is temporarily locked due to 5 consecutive failed login attempts. Please try again in 15 minutes.',
          isLocked: true,
          lockedUntil: new Date(current.lockedUntil).toISOString()
        });
      } else {
        loginAttemptTracker.set(normalizedEmail, current);

        logAuditAction({
          action: 'FAILED_LOGIN_ATTEMPT',
          entityType: 'user',
          entityId: user.id,
          details: `Failed login attempt (${current.count}/${MAX_FAILED_ATTEMPTS}) for email: ${normalizedEmail}`,
          metadata: { email: normalizedEmail, attemptCount: current.count, maxAttempts: MAX_FAILED_ATTEMPTS },
          req,
          userName: user.name,
          userRole: user.role
        }).catch(() => {});

        const remaining = MAX_FAILED_ATTEMPTS - current.count;
        return res.status(401).json({
          field: 'password',
          message: `Incorrect password. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining before temporary lockout.`,
          attemptsRemaining: remaining
        });
      }
    }

    // Success — clear any prior failed attempts
    loginAttemptTracker.delete(normalizedEmail);

    if (!user.is_verified) {
      // Generate new OTP for unverified users trying to log in (valid for 30 days)
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      console.log(`\n🔑 [DEV OTP] Code for ${user.email} is: ${otp} (valid for 30 days)\n`);
      const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

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
                  ⏱️ <strong>This code is valid for 30 days.</strong>
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
      const emailText = `Hello ${user.name},\n\nYour account requires verification.\nYour 6-digit verification code is: ${otp}\n\nThis code is valid for 30 days.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

      sendEmail(user.email, 'Your Verification Code: ' + otp + ' — Fano Dental Clinic', emailHtml, emailText).catch(err => {
        console.error('[Verification Email Error]', err);
      });

      return res.status(403).json({
        message: 'Account not verified. A verification code has been sent to your email.',
        email: user.email,
        requireVerification: true
      });
    }

    logAuditAction({
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
      details: `Successful login for user ${user.email} (${user.role})`,
      metadata: { email: user.email, role: user.role },
      req,
      userName: user.name,
      userRole: user.role
    }).catch(() => {});

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

    // Enforce a 60-second cooldown (allow resending after 60s has elapsed)
    if (user.otp_expires && (new Date(user.otp_expires) - Date.now()) > (OTP_EXPIRY_MS - 60 * 1000)) {
      return res.status(429).json({ message: 'A code was recently sent. Please wait before requesting another.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n🔑 [DEV OTP] Code for ${email} is: ${otp} (valid for 30 days)\n`);
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

    await supabase.from('users').update({
      otp_code: otp,
      otp_expires: otpExpires,
      otp_attempts: 0
    }).eq('id', user.id);

    if (channel === 'sms') {
      if (!user.contact_number) {
        return res.status(400).json({ message: 'No phone number registered for this user.' });
      }
      const message = `Fano Dental Clinic: Your secure login code is ${otp}. Valid for 30 days. Do not share this code.`;
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
                  ⏱️ <strong>This code is valid for 30 days.</strong>
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
      const emailText = `Hello ${user.name},\n\nYour security verification code for Fano Dental Clinic is: ${otp}\n\nThis code is valid for 30 days.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

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
  const { email, otpCode, trustDevice } = req.body;
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
      trustedDevice: !!trustDevice,
      trustedUntil: trustDevice ? new Date(Date.now() + OTP_EXPIRY_MS).toISOString() : null,
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

    // Enforce a 60-second cooldown (allow resending after 60s has elapsed)
    if (user.otp_expires && (new Date(user.otp_expires) - Date.now()) > (OTP_EXPIRY_MS - 60 * 1000)) {
      return res.status(429).json({ message: 'A code was recently sent. Please wait before requesting another.' });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`\n🔑 [DEV RESET OTP] Code for ${email} is: ${otp} (valid for 30 days)\n`);
    const otpExpires = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

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
                ⏱️ <strong>This code is valid for 30 days.</strong>
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
    const emailText = `Hello ${user.name},\n\nWe received a request to reset your password.\nYour 6-digit reset code is: ${otp}\n\nThis code is valid for 30 days.\n\nIf you did not request this, you can safely ignore this email.\n\nFano Dental Clinic\nBalirong Highway, City of Naga, Cebu\n(032) 489-1200`;

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
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanFirst = (firstName || '').trim();
    const cleanLast = (lastName || '').trim();
    const fullName = `${cleanFirst} ${cleanLast}`.trim();
    const cleanPhone = (contactNumber || '').replace(/[\s\-\(\)\.]/g, '').trim();

    if (!cleanEmail) {
      return res.status(400).json({ message: 'Email address is required.', field: 'email' });
    }

    // 1. Check if email already exists
    const { data: existingEmails } = await supabase
      .from('users')
      .select('id, name, email, role')
      .ilike('email', cleanEmail)
      .limit(1);

    const existingEmail = existingEmails && existingEmails.length > 0 ? existingEmails[0] : null;

    if (existingEmail) {
      return res.status(400).json({
        message: `A user with email "${cleanEmail}" already exists in the clinic (${existingEmail.name}, ${existingEmail.role}).`,
        field: 'email'
      });
    }

    // 2. Check if contact number already exists
    if (cleanPhone) {
      const altPhone = cleanPhone.startsWith('+63')
        ? '0' + cleanPhone.slice(3)
        : (cleanPhone.startsWith('0') ? '+63' + cleanPhone.slice(1) : cleanPhone);

      const { data: existingPhones } = await supabase
        .from('users')
        .select('id, name, email, role, contact_number')
        .or(`contact_number.eq.${cleanPhone},contact_number.eq.${altPhone}`)
        .limit(1);

      const existingPhone = existingPhones && existingPhones.length > 0 ? existingPhones[0] : null;

      if (existingPhone) {
        return res.status(400).json({
          message: `The contact number "${contactNumber}" is already in use by ${existingPhone.name} (${existingPhone.email}).`,
          field: 'contactNumber'
        });
      }
    }

    // 3. Check if exact full name already exists
    if (fullName) {
      const { data: existingNames } = await supabase
        .from('users')
        .select('id, name, email, role, contact_number')
        .ilike('name', fullName)
        .limit(1);

      const existingName = existingNames && existingNames.length > 0 ? existingNames[0] : null;

      if (existingName) {
        return res.status(400).json({
          message: `A user record for "${fullName}" already exists with email ${existingName.email}.`,
          field: 'name'
        });
      }
    }

    // Hash password with optimized salt rounds (fast & secure)
    const salt = await bcrypt.genSalt(8);
    const hashedPassword = await bcrypt.hash(password || 'patient123', salt);
 
    // Enforce role restriction: Receptionist can only create Patients
    const assignedRole = req.user.role === 'Receptionist' ? 'Patient' : (role || 'Patient');

    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        first_name: cleanFirst,
        last_name: cleanLast,
        name: fullName,
        email: cleanEmail,
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
 
    if (assignedRole === 'Patient') {
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
  const force = req.query.force === 'true' || req.body?.force === true;
  const reassignTo = req.query.reassignTo || req.body?.reassignTo;

  try {
    // 1. Verify user exists
    const { data: targetUser, error: fetchErr } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) return internalError(res, fetchErr);
    if (!targetUser) {
      return res.status(404).json({ message: 'User account not found.' });
    }

    // 2. Prevent admin self-deletion
    if (req.user && req.user.id === id) {
      return res.status(400).json({ message: 'You cannot delete your own administrative account.' });
    }

    // 3. Check for linked appointments & invoices
    const { data: userAppts } = await supabase
      .from('appointments')
      .select('id')
      .eq('patient_id', id);

    const { data: userInvoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('patient_id', id);

    const apptCount = userAppts?.length || 0;
    const invoiceCount = userInvoices?.length || 0;

    if (apptCount > 0 || invoiceCount > 0) {
      if (reassignTo) {
        // Ensure reassign target exists
        const { data: destUser } = await supabase
          .from('users')
          .select('id, name, email')
          .eq('id', reassignTo)
          .maybeSingle();

        if (!destUser) {
          return res.status(400).json({ message: 'Target user for reassigning records was not found.' });
        }

        if (apptCount > 0) {
          await supabase.from('appointments').update({ patient_id: destUser.id }).eq('patient_id', id);
        }
        if (invoiceCount > 0) {
          await supabase.from('invoices').update({ patient_id: destUser.id }).eq('patient_id', id);
        }
      } else if (force) {
        // Cascade delete dependent appointment treatments, invoices, and appointments
        if (apptCount > 0) {
          const apptIds = userAppts.map(a => a.id);
          await supabase.from('treatments').delete().in('appointment_id', apptIds);
        }
        if (invoiceCount > 0) {
          await supabase.from('invoices').delete().eq('patient_id', id);
        }
        if (apptCount > 0) {
          await supabase.from('appointments').delete().eq('patient_id', id);
        }
      } else {
        return res.status(409).json({
          message: `Cannot delete user "${targetUser.name}" because they have ${apptCount} appointment(s) and ${invoiceCount} billing record(s). Please deactivate their account instead, or specify a target account to merge records.`,
          apptCount,
          invoiceCount
        });
      }
    }

    // 4. Cascade clean up auxiliary tables that reference users(id)
    await supabase.from('patient_profiles').delete().eq('user_id', id);
    await supabase.from('notifications').delete().eq('user_id', id);
    await supabase.from('staff_schedules').delete().eq('id', id);

    // 5. Delete the user record
    const { error: delError } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (delError) {
      if (delError.code === '23503') {
        return res.status(409).json({
          message: 'Cannot delete user because dependent records still reference this account. Please deactivate their account instead.'
        });
      }
      return internalError(res, delError);
    }

    // Trigger non-blocking async backup of staff schedules
    try {
      asyncBackupStaffSchedules();
    } catch (err) {
      console.error('[Sync Staff Schedule Delete Error]', err.message);
    }

    return res.json({ success: true, message: `User account "${targetUser.name}" deleted successfully.` });
  } catch (error) {
    return internalError(res, error);
  }
};
 
 // ─── Social Authentication (Facebook, Google, etc.) ─────────────────────────
// @route   POST /api/auth/social-login
// @access  Public
const socialLogin = async (req, res) => {
  const { access_token, code, provider } = req.body;

  try {
    if (!access_token && !code) {
      return res.status(400).json({ message: 'Authentication token or authorization code is required.' });
    }

    let sbUser = null;

    if (access_token) {
      // Verify token with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.getUser(access_token);
      if (!authError && authData?.user) {
        sbUser = authData.user;
      }
    } else if (code) {
      // Exchange PKCE code for session with Supabase Auth
      const { data: sessionData, error: codeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!codeError && sessionData?.user) {
        sbUser = sessionData.user;
      }
    }

    if (!sbUser) {
      return res.status(401).json({ message: 'Invalid or expired social authentication credentials.' });
    }

    const email = (sbUser.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ 
        message: 'Could not retrieve email from social account. Please ensure email permissions are granted.' 
      });
    }

    // Extract user profile metadata from Facebook / provider
    const meta = sbUser.user_metadata || {};
    const fullName = meta.full_name || meta.name || email.split('@')[0];
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Patient';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User';

    // Check if user already exists in clinic users table (case-insensitive email or matching full name)
    let { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (!existingUser && fullName && fullName.length > 2) {
      const { data: userByName } = await supabase
        .from('users')
        .select('*')
        .ilike('name', fullName)
        .maybeSingle();
      if (userByName) existingUser = userByName;
    }

    if (findError) throw findError;

    let userRecord = existingUser;

    if (!existingUser) {
      // Create new Patient account
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          name: fullName,
          first_name: firstName,
          last_name: lastName,
          email,
          role: 'Patient',
          is_active: true,
          is_verified: true,
          address: 'N/A'
        }])
        .select()
        .single();

      if (insertError) throw insertError;
      userRecord = newUser;

      // Audit log registration
      try {
        logAuditAction({
          action: 'USER_REGISTER_SUCCESS',
          entity_type: 'user',
          entity_id: userRecord.id,
          user_id: userRecord.id,
          user_name: userRecord.name,
          user_role: userRecord.role,
          details: `New patient registered via ${provider || 'Social'} OAuth (${email})`,
          metadata: { provider, email },
          req
        });
      } catch (_) {}
    } else {
      // Check if account is active
      if (!existingUser.is_active) {
        return res.status(403).json({ message: 'Account is deactivated. Please contact clinic support.' });
      }

      // Auto-verify if not verified
      if (!existingUser.is_verified) {
        await supabase
          .from('users')
          .update({ is_verified: true })
          .eq('id', existingUser.id);
        userRecord.is_verified = true;
      }
    }

    // Issue JWT token
    const token = generateToken(userRecord.id);

    // Audit log login
    try {
      logAuditAction({
        action: 'USER_LOGIN_SUCCESS',
        entity_type: 'user',
        entity_id: userRecord.id,
        user_id: userRecord.id,
        user_name: userRecord.name,
        user_role: userRecord.role,
        details: `Successful login via ${provider || 'Social'} OAuth for ${email}`,
        metadata: { provider, email, role: userRecord.role },
        req
      });
    } catch (_) {}

    return res.json({
      token,
      ...mapUser(userRecord)
    });

  } catch (error) {
    console.error('[Social Login Error]', error);
    return internalError(res, error);
  }
};

// @route   GET /api/auth/oauth/:provider
// @access  Public
const getOAuthUrl = async (req, res) => {
  const { provider } = req.params;
  const { redirect_to } = req.query;

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider || 'facebook',
      options: {
        redirectTo: redirect_to || `${req.protocol}://${req.get('host')}/pages/oauth-callback.html`
      }
    });

    if (error || !data?.url) {
      return res.status(400).json({ message: error?.message || 'Failed to generate OAuth URL.' });
    }

    return res.json({ url: data.url, provider });
  } catch (error) {
    return internalError(res, error);
  }
};

module.exports = { 
  registerUser, 
  authUser, 
  sendOTP, 
  verifyOTP, 
  forgotPassword, 
  verifyResetOTP, 
  resetPassword, 
  getUserProfile, 
  getAllUsers, 
  createStaffUser, 
  updateUserStatus, 
  deleteUser,
  socialLogin,
  getOAuthUrl
};
