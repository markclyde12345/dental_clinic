// Shared API client for the Dental Clinic front-end.
// Centralizes the base URL, auth header injection, and error handling.

const BASE_ORIGIN = (
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  window.location.port !== '5000' && window.location.port !== ''
) ? 'http://localhost:5000' : '';
const API_BASE = `${BASE_ORIGIN}/api`;

const api = {
  get token() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  },

  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const t = this.token;
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  },

  async request(method, path, body) {
    const opts = {
      method,
      headers: this._headers(),
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${path}`, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

    if (!res.ok) {
      const msg = (data && data.message) || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  },

  get(path)    { return this.request('GET', path); },
  post(path, b){ return this.request('POST', path, b); },
  put(path, b) { return this.request('PUT', path, b); },
  patch(path, b){ return this.request('PATCH', path, b); },
  del(path)    { return this.request('DELETE', path); },

  // Convenience: appointments for the logged-in dentist
  async myAppointments(onlyMine = false) {
    return this.get(`/appointments/my${onlyMine ? '?onlyMine=true' : ''}`);
  },

  // Dentist portal methods
  getDentistDashboard() { return this.get('/dentist/dashboard'); },
  getDentistAppointments() { return this.get('/dentist/appointments'); },
  getDentistQueue() { return this.get('/dentist/queue'); },
  callNextQueue() { return this.post('/dentist/queue/call-next', {}); },
  getPatientRecord(id) { return this.get(`/dentist/patients/${id}`); },
  updatePatientRecord(id, data) { return this.patch(`/dentist/patients/${id}`, data); },
  addPatientImage(id, data) { return this.post(`/dentist/patients/${id}/images`, data); },
  deletePatientImage(id, imgId) { return this.del(`/dentist/patients/${id}/images/${imgId}`); },
  getDentalChart(patientId) { return this.get(`/dentist/chart/${patientId}`); },
  saveDentalChart(patientId, data) { return this.post(`/dentist/chart/${patientId}`, data); },
  getPrescriptions(patientId) { return this.get(`/dentist/prescriptions${patientId ? `?patientId=${patientId}` : ''}`); },
  createPrescription(data) { return this.post('/dentist/prescriptions', data); },
  getFollowUps() { return this.get('/dentist/followups'); },
  createFollowUp(data) { return this.post('/dentist/followups', data); },
  getDentistReports() { return this.get('/dentist/reports'); },
  getDentistNotifications() { return this.get('/dentist/notifications'); }
};

// Expose globally for non-module scripts
window.api = api;
