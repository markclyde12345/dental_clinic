/**
 * Fano Dental Clinic — Auth JavaScript
 * Handles: Login, Registration, and redirection to OTP Verification
 */

// ─── API Base URL ─────────────────────────────────────────────────────────────
const BASE_ORIGIN = (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '5000' && window.location.port !== ''
) ? 'http://localhost:5000' : '';
const API_BASE = `${BASE_ORIGIN}/api/auth`;

// ─── Utilities ────────────────────────────────────────────────────────────────
function showError(msg) {
  const old = document.getElementById('auth-error');
  if (old) old.remove();

  const el = document.createElement('div');
  el.id = 'auth-error';
  el.textContent = msg;

  const activeForm = document.querySelector('.auth-form');
  if (activeForm) activeForm.appendChild(el);

  setTimeout(() => el.remove(), 6000);
}

function showSuccess(msg) {
  const old = document.getElementById('auth-error');
  if (old) old.remove();

  const el = document.createElement('div');
  el.id = 'auth-error';
  el.textContent = msg;
  el.style.background   = '#e3fcef';
  el.style.color        = '#0e6245';
  el.style.borderColor  = '#c1f5d6';

  const activeForm = document.querySelector('.auth-form');
  if (activeForm) activeForm.appendChild(el);

  setTimeout(() => el.remove(), 6000);
}

/**
 * Wrapper around fetch that returns { ok, status, data }.
 * Network/CORS failures are caught and surfaced as a readable message.
 */
async function apiFetch(url, options = {}) {
  try {
    const res  = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    // fetch() itself threw — server is unreachable or CORS blocked
    const isNetwork = err instanceof TypeError;
    const message   = isNetwork
      ? (BASE_ORIGIN ? 'Cannot reach the backend server (node server.js).' : 'Cannot reach the server. Please check your network connection.')
      : `Unexpected error: ${err.message}`;
    return { ok: false, status: 0, data: { message }, networkError: true };
  }
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── LOGIN FORM ──────────────────────────────────────────────────────────────
  const loginForm = document.getElementById('login-form');

  if (loginForm) {
    // Show success banner if redirected from verify page
    const params = new URLSearchParams(window.location.search);
    if (params.get('verified') === 'true') {
      showSuccess('Account verified! Please log in.');
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const btn      = document.getElementById('login-btn');
      const remember = document.getElementById('remember-me')?.checked;

      if (!email || !password) {
        showError('Please enter your email and password.');
        return;
      }

      btn.textContent = 'Logging in…';
      btn.disabled    = true;

      const { ok, status, data, networkError } = await apiFetch(`${API_BASE}/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });

      if (networkError) {
        showError(data.message);
        btn.textContent = 'Log In';
        btn.disabled    = false;
        return;
      }

      if (ok) {
        // Persist session based on "Remember me"
        if (remember) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userInfo', JSON.stringify(data));
        } else {
          sessionStorage.setItem('token', data.token);
          sessionStorage.setItem('userInfo', JSON.stringify(data));
        }
        // Redirect based on role
        redirectByRole(data.role);
      } else if (status === 403 && data.requireVerification) {
        showError(data.message || 'Account not verified. Redirecting…');
        setTimeout(() => {
          window.location.href = `verify.html?email=${encodeURIComponent(data.email)}&channel=email&flow=signup`;
        }, 1500);
      } else {
        showError(data.message || 'Invalid email or password.');
        btn.textContent = 'Log In';
        btn.disabled    = false;
      }
    });
  }

  // ── SIGNUP FORM ─────────────────────────────────────────────────────────────
  const signupForm = document.getElementById('signup-form');

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const firstName     = document.getElementById('signup-firstname').value.trim();
      const lastName      = document.getElementById('signup-lastname').value.trim();
      const email         = document.getElementById('signup-email').value.trim();
      const contactNumber = document.getElementById('signup-phone').value.trim();
      const address       = document.getElementById('signup-address').value.trim();
      const password      = document.getElementById('signup-password').value;
      const confirmPass   = document.getElementById('signup-confirm').value;
      const btn           = signupForm.querySelector('.auth-btn');

      // ── Terms agreement validation ──
      const termsCheckbox = document.getElementById('signup-terms');
      if (termsCheckbox && !termsCheckbox.checked) {
        showError('Please read and agree to the Terms of Service & Privacy Policy.');
        return;
      }

      // ── Client-side validation ──
      const phoneRegex = /^(09|\+639)\d{9}$/;
      if (!phoneRegex.test(contactNumber)) {
        showError('Enter a valid PH mobile number (e.g. 09171234567 or +639171234567).');
        return;
      }

      if (address.length < 5) {
        showError('Please enter your full home address.');
        return;
      }

      if (password.length < 8) {
        showError('Password must be at least 8 characters.');
        return;
      }

      if (password !== confirmPass) {
        showError('Passwords do not match.');
        return;
      }

      btn.textContent = 'Creating account…';
      btn.disabled    = true;

      const { ok, status, data, networkError } = await apiFetch(`${API_BASE}/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ firstName, lastName, email, contactNumber, address, password }),
      });

      if (networkError) {
        showError(data.message);
        btn.textContent = 'Sign Up';
        btn.disabled    = false;
        return;
      }

      if (ok) {
        if (data.requireVerification) {
          window.location.href = `verify.html?email=${encodeURIComponent(data.email)}&channel=email&flow=signup`;
        } else {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userInfo', JSON.stringify(data));
          redirectByRole(data.role);
        }
      } else {
        showError(data.message || 'Registration failed. Please try again.');
        btn.textContent = 'Sign Up';
        btn.disabled    = false;
      }
    });
  }

  // Initialize password toggles
  initPasswordToggles();

  // Initialize social authentication buttons
  initSocialAuth();

  // Initialize Terms & Privacy policy modals
  initTermsModal();
});

// ─── Social Authentication ───────────────────────────────────────────────────
function initSocialAuth() {
  const googleBtns = document.querySelectorAll('#google-auth-btn');
  const fbBtns     = document.querySelectorAll('#facebook-auth-btn');

  googleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      handleSocialAuth('Google');
    });
  });

  fbBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      handleSocialAuth('Facebook');
    });
  });
}

function handleSocialAuth(provider) {
  showSuccess(`Redirecting to ${provider} authentication…`);
  // If Supabase OAuth or direct provider is enabled
  setTimeout(() => {
    showError(`${provider} login: Please ensure ${provider} OAuth credentials are set in your backend configuration.`);
  }, 1200);
}

// ─── Terms of Service & Privacy Policy Modal ─────────────────────────────────
function initTermsModal() {
  const modal = document.getElementById('termsModal');
  if (!modal) return;

  const modalTitle = document.getElementById('modalTitle');
  const modalBody  = document.getElementById('modalBody');
  const closeBtn   = document.getElementById('closeTermsModal');
  const agreeBtn   = document.getElementById('agreeModalBtn');

  const termsContent = `
    <h3>1. Patient Terms of Agreement</h3>
    <p>By creating an account or accessing services at Fano Dental Clinic, you agree to provide accurate and truthful personal and medical information. All appointments booked online are subject to dentist schedule confirmation.</p>
    <h3>2. Medical & Dental Records</h3>
    <p>Your electronic dental records, treatment histories, and appointment logs are maintained with clinical confidentiality following Philippine healthcare guidelines and patient privacy laws.</p>
    <h3>3. Cancellations & Rescheduling</h3>
    <p>We request patients to provide at least 24 hours advance notice for appointment cancellations or rescheduling to help us accommodate other patients needing urgent dental care.</p>
    <h3>4. Patient Rights & Responsibilities</h3>
    <p>Patients have the right to full informed consent before any dental procedure, transparent cost estimates, and the duty to disclose relevant medical allergies or preexisting health conditions.</p>
  `;

  const privacyContent = `
    <h3>1. Information We Collect</h3>
    <p>We collect essential personal information including your full name, email address, contact phone number, home address, and medical/dental history to provide comprehensive dental treatment.</p>
    <h3>2. How We Protect Your Data</h3>
    <p>All sensitive health records and user credentials are encrypted using industry-standard security protocols and stored securely in certified database infrastructure.</p>
    <h3>3. Privacy & Third-Party Disclosure</h3>
    <p>We do not sell, trade, or share your personal data with third parties, except as required for dental laboratory prosthetics manufacturing, diagnostic imaging, or regulatory compliance.</p>
  `;

  document.querySelectorAll('.open-terms-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      modalTitle.textContent = 'Terms of Service & Agreement';
      modalBody.innerHTML = termsContent;
      modal.classList.add('active');
    });
  });

  document.querySelectorAll('.open-privacy-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      modalTitle.textContent = 'Privacy Policy';
      modalBody.innerHTML = privacyContent;
      modal.classList.add('active');
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }
  if (agreeBtn) {
    agreeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      const termsCheckbox = document.getElementById('signup-terms');
      if (termsCheckbox) termsCheckbox.checked = true;
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
}

// ─── Password Visibility Toggle ───────────────────────────────────────────────
function initPasswordToggles() {
  document.querySelectorAll('.toggle-password').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      if (!input) return;

      const isPassword = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPassword ? 'text' : 'password');

      if (isPassword) {
        button.innerHTML = `
          <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        `;
      } else {
        button.innerHTML = `
          <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
      }
    });
  });
}

// ─── Role-based redirect ──────────────────────────────────────────────────────
function redirectByRole(role) {
  const map = {
    'Admin':            'admin-dashboard.html',
    'Dentist':          'dentist-dashboard.html',
    'Dental Assistant': 'dentist-dashboard.html',
    'Receptionist':     'receptionist-dashboard.html',
    'Accounting':       'accounting-dashboard.html',
    'Patient':          'patient-dashboard.html',
  };
  window.location.href = map[role] || 'patient-dashboard.html';
}
