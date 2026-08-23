// Accounting Dashboard Logic

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
  const displayName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Accountant';
  document.getElementById('user-name').textContent = displayName;
  document.getElementById('user-avatar').textContent = displayName.charAt(0).toUpperCase();

  // Load invoices summary
  const invoiceAPI = API.replace('/auth', '/invoices');
  fetch(invoiceAPI, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(invoices => {
    if (Array.isArray(invoices)) {
      const pendingInvoices = invoices.filter(inv => inv.status === 'Unpaid' || !inv.is_paid);
      document.getElementById('pending-inv-val').textContent = pendingInvoices.length;

      const totalReceivable = pendingInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || inv.total_amount || 0), 0);
      const currency = localStorage.getItem('set-currency') || '₱';
      document.getElementById('receivable-val').textContent = `${currency}${totalReceivable.toFixed(2)}`;

      const activity = document.getElementById('activity-placeholder');
      if (invoices.length > 0) {
        activity.innerHTML = invoices.map(inv => `
          <div style="padding: 12px 0; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between;">
            <div>
              <strong>Invoice #${inv.id.slice(0, 8)}</strong> - 
              Patient: ${inv.patient ? inv.patient.name : 'Unknown'}
            </div>
            <div>
              <span style="font-weight: 600;">${currency}${parseFloat(inv.amount || inv.total_amount || 0).toFixed(2)}</span>
              <span style="margin-left: 10px; color: ${inv.status === 'Paid' || inv.is_paid ? 'green' : 'orange'}">${inv.status}</span>
            </div>
          </div>
        `).join('');
      }
    }
  })
  .catch(err => console.error('Invoices load error:', err));
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  window.location.replace('login.html');
}
