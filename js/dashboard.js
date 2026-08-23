/**
 * Fano Dental Clinic — Dashboard Router
 * Reads the saved token from localStorage (remember me) or sessionStorage,
 * validates it against the server, then redirects to the role-specific dashboard.
 */

const API = 'http://localhost:5000/api/auth';

// Check both storage types (localStorage = "remember me", sessionStorage = session only)
const token    = localStorage.getItem('token') || sessionStorage.getItem('token');
const userInfo = JSON.parse(localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo') || 'null');

if (!token) {
  // Not logged in — send to login page
  window.location.replace('login.html');
} else {
  // If we already have role info cached, redirect immediately (faster UX)
  if (userInfo && userInfo.role) {
    redirectByRole(userInfo.role);
  } else {
    // Fetch profile from server to get the role
    fetch(`${API}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => {
      if (res.status === 401 || res.status === 403) {
        logout();
        return null;
      }
      return res.json();
    })
    .then(user => {
      if (!user || user.message) {
        logout();
        return;
      }
      redirectByRole(user.role);
    })
    .catch(() => {
      // Network error — still try to route using cached info
      if (userInfo && userInfo.role) {
        redirectByRole(userInfo.role);
      } else {
        logout();
      }
    });
  }
}

function redirectByRole(role) {
  const map = {
    'Admin':            'admin-dashboard.html',
    'Dentist':          'dentist-dashboard.html',
    'Dental Assistant': 'dentist-dashboard.html',
    'Receptionist':     'receptionist-dashboard.html',
    'Accounting':       'accounting-dashboard.html',
    'Patient':          'patient-dashboard.html',
  };
  window.location.replace(map[role] || 'patient-dashboard.html');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}
