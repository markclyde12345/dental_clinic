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

  // On page load, the backend has already sent the OTP code during registration or login.
  // Set UI state to sent and start the resend timer to avoid spamming / rate limiting.
  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-dot');
  if (statusText) statusText.textContent = `Code sent via ${currentChannel === 'sms' ? 'SMS' : 'Email'} successfully`;
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

  if (currentChannel === 'sms') {
    smsTab.classList.add('active');
    emailTab.classList.remove('active');
    document.getElementById('verify-subtitle').innerHTML = 'We sent a 6-digit code to your registered mobile number.<br>Enter it below to continue.';
  } else {
    emailTab.classList.add('active');
    smsTab.classList.remove('active');
    document.getElementById('verify-subtitle').innerHTML = 'We sent a 6-digit code to your email address <strong>' + currentEmail + '</strong>.<br>Enter it below.';
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
    } else {
      if (statusText) statusText.textContent = data.message || 'Failed to send code.';
      if (statusDot) statusDot.style.background = '#ff4757'; // error red
    }
  } catch (error) {
    if (statusText) statusText.textContent = 'Server connection error.';
    if (statusDot) statusDot.style.background = '#ff4757';
  }
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
  
  if (btnText) btnText.textContent = 'Verifying…';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${API}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: currentEmail, otpCode: code })
    });
    const data = await res.json();

    if (res.ok) {
      const flow = new URLSearchParams(window.location.search).get('flow');
      if (flow === 'signup') {
        showOtpSuccess('Account verified successfully! Redirecting you to login...');
        setTimeout(() => {
          window.location.href = 'login.html?verified=true';
        }, 2000);
      } else {
        // Save token and login
        localStorage.setItem('token', data.token);
        window.location.href = 'dashboard.html';
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
