const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_CHARS.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateHOTP(secret, counter) {
  const key = typeof secret === 'string' ? base32Decode(secret) : secret;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % 1000000;
  return code.toString().padStart(6, '0');
}

// Built-in standard RFC 6238 TOTP implementation (avoids broken ESM @scure/base in otplib)
const otplib = {
  generateSecret: (length = 20) => base32Encode(crypto.randomBytes(length)),
  generateURI: ({ secret, label, issuer }) => {
    const encLabel = encodeURIComponent(label);
    const encIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${encIssuer}:${encLabel}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
  },
  verifySync: ({ token, secret, window = 1 }) => {
    if (!token || !secret) return { valid: false };
    const cleanToken = String(token).trim();
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    for (let i = -window; i <= window; i++) {
      if (generateHOTP(secret, currentCounter + i) === cleanToken) {
        return { valid: true };
      }
    }
    return { valid: false };
  }
};
const qrcode = require('qrcode');

const VAULT_FILE = path.join(__dirname, '../data/totp_vault.json');
const ISSUER_NAME = 'Fano Dental Clinic';

/**
 * Reads the persistent TOTP vault
 */
function readVault() {
  try {
    if (fs.existsSync(VAULT_FILE)) {
      const raw = fs.readFileSync(VAULT_FILE, 'utf8').replace(/^\uFEFF/, '');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[TOTP Vault Read Error]', err.message);
  }
  return {};
}

/**
 * Saves the persistent TOTP vault
 */
function writeVault(vault) {
  try {
    const dir = path.dirname(VAULT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), 'utf8');
  } catch (err) {
    console.error('[TOTP Vault Save Error]', err.message);
  }
}

/**
 * Generates an array of single-use backup recovery codes (e.g. "A1B2-C3D4")
 */
function generateRawBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const hex = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}`);
  }
  return codes;
}

/**
 * Normalizes user email for vault indexing
 */
function normalizeKey(userOrEmail) {
  if (!userOrEmail) return '';
  if (typeof userOrEmail === 'string') return userOrEmail.trim().toLowerCase();
  if (userOrEmail.email) return userOrEmail.email.trim().toLowerCase();
  return String(userOrEmail.id || '').trim().toLowerCase();
}

/**
 * Generate a new TOTP secret & QR code data URI for setup
 */
async function generateTotpSetup(user) {
  const key = normalizeKey(user);
  if (!key) throw new Error('User email or identifier is required for TOTP setup.');

  const secret = otplib.generateSecret();
  const label = (user && user.email) ? user.email.trim() : key;
  const otpauthUri = otplib.generateURI({
    secret,
    label,
    issuer: ISSUER_NAME
  });

  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 240,
    color: {
      dark: '#0b3c4d',
      light: '#ffffff'
    }
  });

  // Store temp secret until user verifies with an initial 6-digit code
  const vault = readVault();
  vault[key] = {
    ...(vault[key] || {}),
    tempSecret: secret,
    updatedAt: new Date().toISOString()
  };
  writeVault(vault);

  return {
    secret,
    qrCode: qrCodeDataUrl,
    otpauthUri,
    account: label,
    issuer: ISSUER_NAME,
    formattedSecret: secret.match(/.{1,4}/g)?.join(' ') || secret
  };
}

/**
 * Verifies the initial token from authenticator app to finalize and activate TOTP
 */
function verifyAndEnableTotp(user, token) {
  const key = normalizeKey(user);
  const vault = readVault();
  const userEntry = vault[key];

  if (!userEntry || !userEntry.tempSecret) {
    return {
      success: false,
      message: 'No pending TOTP setup found. Please start setup again.'
    };
  }

  const cleanToken = String(token || '').replace(/\D/g, '').trim();
  if (cleanToken.length !== 6) {
    return {
      success: false,
      message: 'Please enter a valid 6-digit verification code from your authenticator app.'
    };
  }

  const verification = otplib.verifySync({
    token: cleanToken,
    secret: userEntry.tempSecret,
    window: 1 // +/- 30 seconds drift allowance
  });

  if (!verification || !verification.valid) {
    return {
      success: false,
      message: 'Invalid authenticator code. Please check that your device time is synchronized and try again.'
    };
  }

  // Generate 8 single-use recovery backup codes
  const rawCodes = generateRawBackupCodes(8);
  const backupCodes = rawCodes.map(code => ({
    code,
    used: false,
    usedAt: null
  }));

  userEntry.secret = userEntry.tempSecret;
  userEntry.tempSecret = null;
  userEntry.enabled = true;
  userEntry.backupCodes = backupCodes;
  userEntry.enabledAt = new Date().toISOString();
  userEntry.updatedAt = new Date().toISOString();

  vault[key] = userEntry;
  writeVault(vault);

  return {
    success: true,
    message: 'Authenticator app (TOTP) successfully enabled!',
    backupCodes: rawCodes
  };
}

/**
 * Checks if TOTP is active for the given user
 */
function isTotpEnabledForUser(userOrEmail) {
  const key = normalizeKey(userOrEmail);
  const vault = readVault();
  return !!(vault[key] && vault[key].enabled && vault[key].secret);
}

/**
 * Verifies a TOTP 6-digit code OR a single-use backup recovery code
 */
function verifyTotpOrBackup(userOrEmail, code) {
  const key = normalizeKey(userOrEmail);
  const vault = readVault();
  const userEntry = vault[key];

  if (!userEntry || !userEntry.enabled || !userEntry.secret) {
    return { valid: false, message: 'TOTP is not enabled for this account.' };
  }

  const rawInput = String(code || '').trim();
  const cleanDigits = rawInput.replace(/\D/g, '');

  // 1. Try TOTP 6-digit code
  if (cleanDigits.length === 6 && /^\d{6}$/.test(rawInput.replace(/\s+/g, ''))) {
    const result = otplib.verifySync({
      token: cleanDigits,
      secret: userEntry.secret,
      window: 1 // +/- 30 seconds allowance
    });

    if (result && result.valid) {
      userEntry.lastVerifiedAt = new Date().toISOString();
      vault[key] = userEntry;
      writeVault(vault);
      return { valid: true, method: 'totp' };
    }
  }

  // 2. Try Backup recovery code (formatted like "A1B2-C3D4" or "A1B2C3D4")
  const cleanBackup = rawInput.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleanBackup.length === 8 && Array.isArray(userEntry.backupCodes)) {
    const codeIndex = userEntry.backupCodes.findIndex(b => {
      if (b.used) return false;
      const storedClean = String(b.code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      return storedClean === cleanBackup;
    });

    if (codeIndex !== -1) {
      userEntry.backupCodes[codeIndex].used = true;
      userEntry.backupCodes[codeIndex].usedAt = new Date().toISOString();
      userEntry.lastVerifiedAt = new Date().toISOString();
      vault[key] = userEntry;
      writeVault(vault);

      const remaining = userEntry.backupCodes.filter(b => !b.used).length;
      return {
        valid: true,
        method: 'backup_code',
        remainingBackupCodes: remaining,
        message: `Backup code accepted. ${remaining} backup recovery code${remaining === 1 ? '' : 's'} remaining.`
      };
    }
  }

  return { valid: false, message: 'Invalid authenticator code or recovery code.' };
}

/**
 * Disables TOTP 2FA for a user
 */
function disableTotp(userOrEmail) {
  const key = normalizeKey(userOrEmail);
  const vault = readVault();
  if (vault[key]) {
    vault[key].enabled = false;
    vault[key].secret = null;
    vault[key].tempSecret = null;
    vault[key].backupCodes = [];
    vault[key].updatedAt = new Date().toISOString();
    writeVault(vault);
  }
  return { success: true, message: 'TOTP 2FA has been disabled.' };
}

/**
 * Get current TOTP status for a user
 */
function getTotpStatus(userOrEmail) {
  const key = normalizeKey(userOrEmail);
  const vault = readVault();
  const entry = vault[key];

  if (!entry || !entry.enabled) {
    return {
      enabled: false,
      remainingBackupCodes: 0
    };
  }

  const remainingCodes = Array.isArray(entry.backupCodes)
    ? entry.backupCodes.filter(b => !b.used).length
    : 0;

  return {
    enabled: true,
    enabledAt: entry.enabledAt,
    lastVerifiedAt: entry.lastVerifiedAt,
    remainingBackupCodes: remainingCodes,
    totalBackupCodes: Array.isArray(entry.backupCodes) ? entry.backupCodes.length : 0,
    issuer: ISSUER_NAME
  };
}

/**
 * Regenerate a new batch of 8 backup recovery codes
 */
function regenerateBackupCodes(userOrEmail) {
  const key = normalizeKey(userOrEmail);
  const vault = readVault();
  const entry = vault[key];

  if (!entry || !entry.enabled) {
    return { success: false, message: 'TOTP is not enabled for this account.' };
  }

  const rawCodes = generateRawBackupCodes(8);
  entry.backupCodes = rawCodes.map(code => ({
    code,
    used: false,
    usedAt: null
  }));
  entry.updatedAt = new Date().toISOString();

  vault[key] = entry;
  writeVault(vault);

  return {
    success: true,
    message: 'New backup recovery codes generated successfully. Previous codes are now invalid.',
    backupCodes: rawCodes
  };
}

module.exports = {
  generateTotpSetup,
  verifyAndEnableTotp,
  isTotpEnabledForUser,
  verifyTotpOrBackup,
  disableTotp,
  getTotpStatus,
  regenerateBackupCodes
};
