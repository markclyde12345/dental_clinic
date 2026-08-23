// Receptionist Dashboard Logic

document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

const API = 'http://localhost:5000/api/auth';

const token = localStorage.getItem('token') || sessionStorage.getItem('token');
let user = null;

if (!token) {
  window.location.href = 'login.html';
} else {
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
  .then(data => {
    if (!data) return;
    if (data.message) {
      logout();
    } else {
      user = data;
      renderDashboard();
    }
  })
  .catch(() => {
    logout();
  });
}

function renderDashboard() {
  const displayName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Receptionist';
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('user-avatar').textContent = displayName.charAt(0).toUpperCase();

  // Load appointments list for front desk
  const apptAPI = API.replace('/auth', '/appointments');
  fetch(apptAPI, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(appointments => {
    if (Array.isArray(appointments) && appointments.length > 0) {
      const activity = document.getElementById('activity-placeholder');
      activity.innerHTML = appointments.map(appt => `
        <div style="padding: 12px 0; border-bottom: 1px solid var(--border-color);">
          <strong>${new Date(appt.appointment_date).toLocaleString()}</strong> - 
          Patient: ${appt.patient ? appt.patient.name : 'Unknown'} - 
          Notes: ${appt.notes || 'None'}
          (${appt.status})
        </div>
      `).join('');
    }
  })
  .catch(err => console.error('Appointments load error:', err));
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}
