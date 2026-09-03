/**
 * Fano Dental Clinic — Forgot Password Script
 * 3-step flow:
 *   Step 1. User enters email → POST /forgot-password  (sends OTP to email)
 *   Step 2. User enters 6-digit code → POST /verify-reset-otp (returns resetToken)
 *   Step 3. User sets new password → POST /reset-password
 */

const BASE_ORIGIN = (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '5000' && window.location.port !== ''
) ? 'http://localhost:5000' : '';
const API = `${BASE_ORIGIN}/api/auth`;

let currentEmail  = '';
let resetToken    = '';
let resendCooldown = 60;
let cooldownTimer  = null;

const STEP = { EMAIL: 1, OTP: 2, NEW_PASSWORD: 3 };

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const emailForm   = document.getElementById('forgot-email-form');
  const otpForm     = document.getElementById('fp-otp-form');
  const newPassForm = document.getElementById('fp-newpass-form');

  if (emailForm)   emailForm.addEventListener('submit', sendResetCode);
  if (otpForm)     otpForm.addEventListener('submit', verifyResetCode);
  if (newPassForm) newPassForm.addEventListener('submit', resetPassword);

  setupOtpInputs();
  initPasswordToggles();

  const backBtn = document.getElementById('fp-back-to-email');
  if (backBtn) backBtn.addEventListener('click', () => goToStep(STEP.EMAIL));

  // Restore OTP step if user refreshed mid-flow
  const savedEmail = localStorage.getItem('fpEmail');
  const params = new URLSearchParams(window.location.search);
  if (params.get('sent') === 'true' && savedEmail) {
    currentEmail = savedEmail;
    goToStep(STEP.OTP);
  }
});

// ─── Step navigation ──────────────────────────────────────────────────────────
function goToStep(step) {
  document.querySelectorAll('.forgot-step').forEach(sec => (sec.style.display = 'none'));

  const section = document.getElementById(`step-${step}`);
  if (section) section.style.display = 'block';

  updateStepIndicator(step);

  if (step === STEP.OTP) {
    // Show which email the code was sent to
    const emailEl = document.getElementById('fp-otp-email');
    if (emailEl) emailEl.textContent = currentEmail;

    // Update status indicator to "sent"
    const statusText = document.getElementById('fp-status-text');
    const statusDot  = document.querySelector('#fp-status .status-dot');
    if (statusText) statusText.textContent = 'Code sent to your email';
    if (statusDot)  statusDot.style.background = '#10b981';

    // Focus first OTP box
    const firstBox = document.querySelector('#fp-otp-boxes .otp-box');
    if (firstBox) setTimeout(() => firstBox.focus(), 80);
  }

  if (step === STEP.EMAIL) {
    clearError('fp-error');
    const emailInput = document.getElementById('fp-email');
    if (emailInput) setTimeout(() => emailInput.focus(), 80);
  }
}

function updateStepIndicator(step) {
  const items = document.querySelectorAll('#step-indicator .step-item');
  const stepIndex = { 1: 0, 2: 1, 3: 2 };
  items.forEach((item, idx) => {
    const isCompleted = idx < stepIndex[step];
    const isCurrent   = idx === stepIndex[step];
    item.classList.toggle('done',   isCompleted);
    item.classList.toggle('active', isCurrent);
    const dot = item.querySelector('.step-dot');
    if (dot) dot.textContent = isCompleted ? '✓' : String(idx + 1);
  });
}

// ─── Error / message helpers ──────────────────────────────────────────────────
function showError(elId, msg, isSuccess = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background   = isSuccess ? '#e3fcef' : '#fef2f2';
  el.style.color        = isSuccess ? '#0e6245' : '#dc2626';
  el.style.borderColor  = isSuccess ? '#c1f5d6' : '#fecaca';
  el.style.border       = '1px solid';
  el.style.borderRadius = '8px';
  el.style.padding      = '10px 14px';
  el.style.fontSize     = '0.875rem';
  el.style.fontWeight   = '500';
}

function clearError(elId) {
  const el = document.getElementById(elId);
  if (el) { el.style.display = 'none'; el.textContent = ''; }
}

function setBtn(btnId, text, disabled) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = disabled;
  const span = btn.querySelector('span');
  if (span) span.textContent = text;
  else btn.textContent = text;
}

// ─── STEP 1: Send reset code to email ────────────────────────────────────────
async function sendResetCode(e) {
  e.preventDefault();
  clearError('fp-error');

  const emailInput = document.getElementById('fp-email');
  const email = (emailInput ? emailInput.value : '').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('fp-error', '⚠️ Please enter a valid email address.');
    return;
  }

  setBtn('fp-continue-btn', 'Sending code…', true);

  try {
    const res  = await fetch(`${API}/forgot-password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email })
    });
    const data = await res.json();

    if (res.status === 429) {
      showError('fp-error', '⏳ ' + (data.message || 'Please wait before requesting another code.'));
      setBtn('fp-continue-btn', 'Send Reset Code', false);
      return;
    }

    // Backend always returns 200 (to prevent email enumeration).
    // Advance to OTP step regardless — the code was sent if the email exists.
    currentEmail = email;
    localStorage.setItem('fpEmail', email);

    setBtn('fp-continue-btn', 'Send Reset Code', false);
    goToStep(STEP.OTP);
    startResendCooldown();

  } catch {
    showError('fp-error', '🔌 Server connection error. Please try again.');
    setBtn('fp-continue-btn', 'Send Reset Code', false);
  }
}

// ─── STEP 2: Verify the 6-digit code ─────────────────────────────────────────
async function verifyResetCode(e) {
  e.preventDefault();
  clearError('fp-otp-error');

  const inputs = document.querySelectorAll('#fp-otp-boxes .otp-box');
  let code = '';
  inputs.forEach(inp => (code += inp.value));

  if (code.length < 6 || !/^\d{6}$/.test(code)) {
    showError('fp-otp-error', '⚠️ Please enter the complete 6-digit code sent to your email.');
    return;
  }

  setBtn('fp-verify-btn', 'Verifying…', true);

  try {
    const res  = await fetch(`${API}/verify-reset-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: currentEmail, otpCode: code })
    });
    const data = await res.json();

    if (res.ok) {
      resetToken = data.resetToken;
      clearOtpInputs();
      // Clear cooldown timer
      if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
      goToStep(STEP.NEW_PASSWORD);
    } else if (res.status === 429) {
      showError('fp-otp-error', '🚫 ' + (data.message || 'Too many failed attempts. Please request a new code.'));
      setBtn('fp-verify-btn', 'Verify Code', false);
      clearOtpInputs();
    } else {
      showError('fp-otp-error', '❌ ' + (data.message || 'Invalid or expired reset code. Please check your email.'));
      setBtn('fp-verify-btn', 'Verify Code', false);
      clearOtpInputs();
    }
  } catch {
    showError('fp-otp-error', '🔌 Server connection error. Please try again.');
    setBtn('fp-verify-btn', 'Verify Code', false);
  }
}

// ─── STEP 3: Set new password ─────────────────────────────────────────────────
async function resetPassword(e) {
  e.preventDefault();
  clearError('fp-newpass-error');

  const newPass     = document.getElementById('fp-new-password').value;
  const confirmPass = document.getElementById('fp-confirm-password').value;

  const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
  if (!strongPwd.test(newPass)) {
    showError('fp-newpass-error', '🔒 Password must be at least 8 characters and include an uppercase letter, a number, and a special character.');
    return;
  }
  if (newPass !== confirmPass) {
    showError('fp-newpass-error', '⚠️ Passwords do not match. Please re-enter.');
    return;
  }

  setBtn('fp-reset-btn', 'Resetting…', true);

  try {
    const res  = await fetch(`${API}/reset-password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ resetToken, newPassword: newPass })
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.removeItem('fpEmail');
      showSuccessScreen(data.message || 'Password reset successfully.');
    } else {
      showError('fp-newpass-error', '❌ ' + (data.message || 'Failed to reset password. Please try again.'));
      setBtn('fp-reset-btn', 'Reset Password', false);
    }
  } catch {
    showError('fp-newpass-error', '🔌 Server connection error. Please try again.');
    setBtn('fp-reset-btn', 'Reset Password', false);
  }
}

// ─── Success screen (replaces step-3 content) ────────────────────────────────
function showSuccessScreen(msg) {
  const section = document.getElementById('step-3');
  if (!section) return;

  // Update step indicator to all done
  document.querySelectorAll('#step-indicator .step-item').forEach((item, idx) => {
    item.classList.add('done');
    item.classList.remove('active');
    const dot = item.querySelector('.step-dot');
    if (dot) dot.textContent = '✓';
  });

  section.innerHTML = `
    <div class="forgot-icon" style="background:#e3fcef; border-color:#c1f5d6;">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="#0e6245" stroke-width="1.8"/>
        <path d="M8 12.5L10.5 15L16 9.5" stroke="#0e6245" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1 class="verify-title" style="color:#0e6245;">Password Reset!</h1>
    <p class="verify-subtitle">${escapeHtml(msg)}</p>
    <p class="verify-subtitle" style="font-size:0.85rem; color:#64748b; margin-top:4px;">
      You can now log in with your new password.
    </p>
    <a href="login.html" class="verify-btn" style="text-decoration:none;text-align:center;display:flex;align-items:center;justify-content:center;margin-top:12px;">
      Back to Login
    </a>
  `;
}

// ─── OTP input grid ───────────────────────────────────────────────────────────
function setupOtpInputs() {
  const container = document.getElementById('fp-otp-boxes');
  if (!container) return;
  const inputs = container.querySelectorAll('.otp-box');

  inputs.forEach((input, index) => {
    // Only allow digits
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[0] : '';
      if (val) {
        e.target.classList.add('filled');
        if (index < inputs.length - 1) inputs[index + 1].focus();
      } else {
        e.target.classList.remove('filled');
      }
    });

    // Backspace navigation
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (input.value) {
          input.value = '';
          input.classList.remove('filled');
        } else if (index > 0) {
          inputs[index - 1].value = '';
          inputs[index - 1].classList.remove('filled');
          inputs[index - 1].focus();
        }
      }
      // Allow arrow key navigation
      if (e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); inputs[index - 1].focus(); }
      if (e.key === 'ArrowRight' && index < inputs.length - 1) { e.preventDefault(); inputs[index + 1].focus(); }
    });

    // Paste entire code
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (pasted.length >= 6) {
        inputs.forEach((inp, idx) => {
          inp.value = pasted[idx] || '';
          inp.classList.toggle('filled', !!pasted[idx]);
        });
        inputs[Math.min(5, pasted.length - 1)].focus();
      }
    });
  });
}

function clearOtpInputs() {
  const inputs = document.querySelectorAll('#fp-otp-boxes .otp-box');
  inputs.forEach(inp => { inp.value = ''; inp.classList.remove('filled'); });
  const first = inputs[0];
  if (first) first.focus();
}

// ─── Resend cooldown timer ────────────────────────────────────────────────────
function startResendCooldown() {
  const resendBtn   = document.getElementById('fp-resend-btn');
  const resendTimer = document.getElementById('fp-resend-timer');
  const countdown   = document.getElementById('fp-countdown');
  if (!resendBtn || !resendTimer || !countdown) return;

  resendBtn.style.display   = 'none';
  resendTimer.style.display = 'inline';
  resendCooldown = 60;
  countdown.textContent = resendCooldown;

  if (cooldownTimer) clearInterval(cooldownTimer);

  cooldownTimer = setInterval(() => {
    resendCooldown--;
    countdown.textContent = resendCooldown;
    if (resendCooldown <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      resendBtn.style.display   = 'inline';
      resendTimer.style.display = 'none';
    }
  }, 1000);
}

// ─── Resend code button ───────────────────────────────────────────────────────
async function resendResetCode() {
  const statusText = document.getElementById('fp-status-text');
  const statusDot  = document.querySelector('#fp-status .status-dot');
  const resendBtn  = document.getElementById('fp-resend-btn');

  if (resendBtn) resendBtn.disabled = true;
  if (statusText) statusText.textContent = 'Resending code…';
  if (statusDot)  statusDot.style.background = '#c59b27';

  try {
    const res  = await fetch(`${API}/forgot-password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: currentEmail })
    });
    const data = await res.json();

    if (res.status === 429) {
      if (statusText) statusText.textContent = data.message || 'Please wait before requesting another code.';
      if (statusDot)  statusDot.style.background = '#ef4444';
      if (resendBtn)  resendBtn.disabled = false;
      return;
    }

    // Success (or silent success for non-existent emails)
    if (statusText) statusText.textContent = 'New code sent to your email';
    if (statusDot)  statusDot.style.background = '#10b981';
    clearOtpInputs();
    startResendCooldown();
  } catch {
    if (statusText) statusText.textContent = 'Server connection error. Try again.';
    if (statusDot)  statusDot.style.background = '#ef4444';
    if (resendBtn)  resendBtn.disabled = false;
  }
}

// ─── Password toggle eye icon ─────────────────────────────────────────────────
function initPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      button.innerHTML = isPassword ? `
        <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>` : `
        <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>`;
    });
  });
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Expose for inline HTML onclick
window.resendResetCode = resendResetCode;
