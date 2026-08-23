/**
 * Fano Dental Clinic — Auth JavaScript
 * Handles: Login, Registration, and redirection to OTP Verification
 */

// ─── API Base URL ─────────────────────────────────────────────────────────────
// Always point to the backend at port 5000, regardless of which port the
// front-end is served from (e.g. VS Code Live Server on 5500, or direct 5000).
const API_BASE = 'http://localhost:5000/api/auth';

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
      ? 'Cannot reach the server. Make sure the backend is running (node server.js).'
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
});

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
