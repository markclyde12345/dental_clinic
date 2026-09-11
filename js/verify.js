/**
 * Fano Dental Clinic — Verification Script
 * Handles 6-digit grid inputs, auto-focus, paste, channel switching, and OTP verification API
 */

const BASE_ORIGIN = (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '5000' && window.location.port !== ''
) ? 'http://localhost:5000' : '';
const API = `${BASE_ORIGIN}/api/auth`;
let currentEmail = '';
let currentChannel = 'email';
let resendCooldown = 60;
let cooldownTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  // Parse params
  const params = new URLSearchParams(window.location.search);
  currentEmail = params.get('email');
  currentChannel = params.get('channel') || 'email';

  if (!currentEmail) {
    // If no email, send back to login
    window.location.href = 'login.html';
    return;
  }

  // Set tab active state
  updateChannelTabs();

  // If Admin MFA flow, customize branding and titles
  const flow = params.get('flow');
  if (flow === 'admin-mfa') {
    document.title = 'Admin Two-Factor Authentication — Fano Dental Clinic';
    const titleEl = document.getElementById('verify-title');
    if (titleEl) titleEl.textContent = 'Admin Two-Factor Authentication';

    const shieldEl = document.getElementById('verify-shield');
    if (shieldEl) {
      shieldEl.innerHTML = `
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #0b3c4d;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" fill="rgba(11,60,77,0.12)"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#c59b27" stroke-width="2.5"></path>
        </svg>
      `;
      shieldEl.style.background = 'linear-gradient(135deg, rgba(11,60,77,0.08), rgba(197,155,39,0.15))';
      shieldEl.style.border = '2px solid rgba(197,155,39,0.45)';
      shieldEl.style.boxShadow = '0 8px 24px rgba(11,60,77,0.15)';
    }

    const verifyBtnText = document.getElementById('verify-btn-text');
    if (verifyBtnText) verifyBtnText.textContent = 'Authenticate & Enter Console';
  }

  // Display Dev / Demo code helper if available
  const devCode = params.get('devCode');
  if (devCode) {
    showDevCodeHelper(devCode);
  }

  // On page load, the backend has already sent the OTP code during registration or login.
  // Set UI state to sent and start the resend timer to avoid spamming / rate limiting.
  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-dot');
  if (statusText) statusText.textContent = `Security code sent via ${currentChannel === 'sms' ? 'SMS' : 'Email'} successfully`;
  if (statusDot) statusDot.style.background = '#2ed573'; // success green
  startResendCooldown();

  // Setup input grid behavior
  setupOtpInputs();

  // Setup form submission
  const form = document.getElementById('otp-form');
  if (form) {
    form.addEventListener('submit', handleVerifySubmit);
  }
});

// Switch active tab
function switchChannel(channel) {
  if (channel === currentChannel) return;
  currentChannel = channel;
  
  // Update tabs
  updateChannelTabs();
  
  // Clear inputs
  clearOtpInputs();

  // Resend code via new channel
  sendOTPCode();
}

function updateChannelTabs() {
  const emailTab = document.getElementById('tab-email');
  const smsTab = document.getElementById('tab-sms');
  const flow = new URLSearchParams(window.location.search).get('flow');
  const isAdminMfa = flow === 'admin-mfa';

  if (currentChannel === 'sms') {
    smsTab.classList.add('active');
    emailTab.classList.remove('active');
    document.getElementById('verify-subtitle').innerHTML = isAdminMfa
      ? 'We sent a 6-digit MFA security code to your registered mobile number.<br>Enter it below to authenticate the Admin Console.'
      : 'We sent a 6-digit code to your registered mobile number.<br>Enter it below to continue. Code is valid for 30 days.';
  } else {
    emailTab.classList.add('active');
    smsTab.classList.remove('active');
    document.getElementById('verify-subtitle').innerHTML = isAdminMfa
      ? 'We sent a 6-digit MFA security code to <strong>' + currentEmail + '</strong>.<br>Enter it below to authenticate the Admin Console.'
      : 'We sent a 6-digit code to your email address <strong>' + currentEmail + '</strong>.<br>Enter it below. Code is valid for 30 days.';
  }
}

// Send OTP API call
async function sendOTPCode() {
  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-dot');
  
  if (statusText) statusText.textContent = 'Sending secure code…';
  if (statusDot) statusDot.style.background = 'var(--purple)';

  try {
    const res = await fetch(`${API}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail, channel: currentChannel })
    });
    const data = await res.json();
    
    if (res.ok) {
      if (statusText) statusText.textContent = `Code sent via ${currentChannel === 'sms' ? 'SMS' : 'Email'} successfully`;
      if (statusDot) statusDot.style.background = '#2ed573'; // success green
      startResendCooldown();
      if (data.devCode) {
        showDevCodeHelper(data.devCode);
      }
    } else {
      if (statusText) statusText.textContent = data.message || 'Failed to send code.';
      if (statusDot) statusDot.style.background = '#ff4757'; // error red
    }
  } catch (error) {
    if (statusText) statusText.textContent = 'Server connection error.';
    if (statusDot) statusDot.style.background = '#ff4757';
  }
}

// ─── Dev / Demo OTP Helper Functions ──────────────────────────────────────────
window.autoFillDevCode = function(code) {
  const container = document.getElementById('otp-boxes');
  if (!container || !code) return;
  const inputs = container.querySelectorAll('.otp-box');
  for (let i = 0; i < 6 && i < code.length; i++) {
    if (inputs[i]) inputs[i].value = code[i];
  }
  const btn = document.getElementById('verify-btn');
  if (btn) btn.focus();
};

function showDevCodeHelper(code) {
  const existing = document.getElementById('dev-otp-helper');
  if (existing) existing.remove();

  const form = document.getElementById('otp-form');
  if (!form) return;

  const helper = document.createElement('div');
  helper.id = 'dev-otp-helper';
  helper.style.cssText = 'margin: 0 0 16px 0; background: #eff6ff; border: 1px dashed #3b82f6; border-radius: 10px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; font-size: 0.82rem; color: #1e40af;';
  helper.innerHTML = `
    <span>🔑 <strong>Dev / Demo Code:</strong> <code style="font-size: 1.05rem; font-weight: 800; letter-spacing: 2px;">${code}</code></span>
    <button type="button" onclick="autoFillDevCode('${code}')" style="background: #2563eb; color: white; border: none; border-radius: 6px; padding: 5px 12px; font-size: 0.78rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">Auto-Fill</button>
  `;
  form.insertBefore(helper, form.firstChild);
}

// Setup 6 digit inputs behavior
function setupOtpInputs() {
  const container = document.getElementById('otp-boxes');
  if (!container) return;

  const inputs = container.querySelectorAll('.otp-box');

  inputs.forEach((input, index) => {
    // Focus first element on load
    if (index === 0) input.focus();

    // Input event (digits only, move focus forward)
    input.addEventListener('input', (e) => {
      const value = e.target.value;
      
      // Allow only numbers
      if (!/^[0-9]$/.test(value)) {
        e.target.value = '';
        return;
      }

      // Move to next input
      if (index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });

    // Keydown event (backspace to go back)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (input.value === '') {
          // If empty, delete previous input and focus it
          if (index > 0) {
            inputs[index - 1].value = '';
            inputs[index - 1].focus();
          }
        } else {
          // Clear current input value
          input.value = '';
        }
        e.preventDefault();
      }
    });

    // Handle pasting the code
    input.addEventListener('paste', (e) => {
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
      if (/^\d{6}$/.test(pasteData)) {
        inputs.forEach((inp, idx) => {
          inp.value = pasteData[idx];
        });
        // Focus the last box
        inputs[5].focus();
      }
      e.preventDefault();
    });
  });
}

// Clear all input boxes
function clearOtpInputs() {
  const container = document.getElementById('otp-boxes');
  if (container) {
    const inputs = container.querySelectorAll('.otp-box');
    inputs.forEach(input => input.value = '');
    inputs[0].focus();
  }
}

// Verification form submission
async function handleVerifySubmit(e) {
  e.preventDefault();
  
  const container = document.getElementById('otp-boxes');
  const inputs = container.querySelectorAll('.otp-box');
  let code = '';
  inputs.forEach(input => code += input.value);

  const errorDiv = document.getElementById('otp-error');
  if (errorDiv) errorDiv.style.display = 'none';

  if (code.length < 6) {
    showOtpError('Please enter the complete 6-digit code.');
    return;
  }

  const btn = document.getElementById('verify-btn');
  const btnText = document.getElementById('verify-btn-text');
  const trustDevice = document.getElementById('trust-device') ? document.getElementById('trust-device').checked : true;
  
  if (btnText) btnText.textContent = 'Verifying…';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail, otpCode: code, trustDevice })
    });
    const data = await res.json();

    if (res.ok) {
      const emailLower = currentEmail.toLowerCase();
      if (trustDevice) {
        localStorage.setItem(`fano_trusted_device_${emailLower}`, JSON.stringify({
          email: emailLower,
          trustedUntil: data.trustedUntil || (Date.now() + 30 * 24 * 60 * 60 * 1000)
        }));
        if (data.trustDeviceToken) {
          localStorage.setItem(`fano_trusted_device_token_${emailLower}`, data.trustDeviceToken);
        }
      }

      const flow = new URLSearchParams(window.location.search).get('flow');
      if (flow === 'signup') {
        showOtpSuccess('Account verified successfully! Redirecting you to login...');
        setTimeout(() => {
          window.location.href = 'login.html?verified=true';
        }, 2000);
      } else {
        // Clear stored tab state so admin portal opens cleanly to Dashboard
        localStorage.removeItem('admin_active_tab');
        sessionStorage.removeItem('admin_active_tab');

        // Save token and login
        const userInfo = {
          _id: data._id,
          name: data.name,
          email: data.email,
          role: data.role,
          token: data.token
        };
        if (trustDevice) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userInfo', JSON.stringify(userInfo));
        } else {
          sessionStorage.setItem('token', data.token);
          sessionStorage.setItem('userInfo', JSON.stringify(userInfo));
        }

        if (flow === 'admin-mfa' || data.role === 'Admin') {
          showOtpSuccess('🛡️ Admin MFA verification confirmed! Launching Admin Console…');
          setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
          }, 800);
        } else {
          window.location.href = 'dashboard.html';
        }
      }
    } else {
      showOtpError(data.message || 'Invalid or expired verification code.');
      if (btnText) btnText.textContent = 'Verify & Continue';
      if (btn) btn.disabled = false;
      clearOtpInputs();
    }
  } catch (error) {
    showOtpError('Server connection error. Please try again.');
    if (btnText) btnText.textContent = 'Verify & Continue';
    if (btn) btn.disabled = false;
  }
}

function showOtpSuccess(msg) {
  const errorDiv = document.getElementById('otp-error');
  if (errorDiv) {
    errorDiv.textContent = msg;
    errorDiv.style.background = '#e3fcef';
    errorDiv.style.color = '#0e6245';
    errorDiv.style.borderColor = '#c1f5d6';
    errorDiv.style.display = 'block';
  }
}

function showOtpError(msg) {
  const errorDiv = document.getElementById('otp-error');
  if (errorDiv) {
    errorDiv.textContent = msg;
    errorDiv.style.background = '#fdf2f2';
    errorDiv.style.color = '#b33939';
    errorDiv.style.borderColor = '#f8d7da';
    errorDiv.style.display = 'block';
  }
}

// Resend Cooldown management
function startResendCooldown() {
  const resendBtn = document.getElementById('resend-btn');
  const resendTimer = document.getElementById('resend-timer');
  const countdown = document.getElementById('countdown');
  
  if (!resendBtn || !resendTimer) return;

  resendBtn.style.display = 'none';
  resendTimer.style.display = 'inline';
  
  resendCooldown = 60;
  countdown.textContent = resendCooldown;

  if (cooldownTimer) clearInterval(cooldownTimer);

  cooldownTimer = setInterval(() => {
    resendCooldown--;
    countdown.textContent = resendCooldown;
    if (resendCooldown <= 0) {
      clearInterval(cooldownTimer);
      resendBtn.style.display = 'inline';
      resendTimer.style.display = 'none';
    }
  }, 1000);
}

function resendOTP() {
  sendOTPCode();
}
