/**
 * Fano Dental Clinic — Use Case No. 015: Book via QR / Portal
 * Client-side Controller for Dedicated Walk-in & Mobile Booking Flow
 */

const API_BASE = '/api';

// Application State
let currentStep = 1;
let selectedService = {
  id: '',
  name: 'Routine Cleaning & General Checkup',
  price: 800
};
let selectedDentist = 'Dr. Ana Reyes';
let selectedTime = '';
let selectedPayment = 'cash';
let occupiedSlots = [];

document.addEventListener('DOMContentLoaded', () => {
  initBranchParam();
  initDefaultsAndDates();
  initCardPickers();
  checkExistingSession();
  loadLiveTreatments();
});

/* ── 1. Branch URL Parameter Detection ── */
function initBranchParam() {
  const urlParams = new URLSearchParams(window.location.search);
  const branchParam = urlParams.get('branch');
  const branchSelect = document.getElementById('clinic-branch');
  const branchPill = document.getElementById('active-branch-name');

  if (branchParam && branchSelect) {
    const options = Array.from(branchSelect.options);
    const matched = options.find(o => o.value.toLowerCase().includes(branchParam.toLowerCase()));
    if (matched) {
      branchSelect.value = matched.value;
      if (branchPill) branchPill.textContent = matched.value;
    }
  }

  branchSelect?.addEventListener('change', () => {
    if (branchPill) branchPill.textContent = branchSelect.value;
  });
}

/* ── 2. Date Constraints & Default Slots ── */
function initDefaultsAndDates() {
  const dateInput = document.getElementById('appointment-date');
  if (dateInput) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const minDateStr = `${yyyy}-${mm}-${dd}`;
    dateInput.min = minDateStr;
    dateInput.value = minDateStr; // Default to today for walk-ins

    dateInput.addEventListener('change', () => {
      fetchOccupiedSlots(dateInput.value);
    });

    // Initial check for today
    fetchOccupiedSlots(minDateStr);
  }
}

/* ── 3. Auto-fill if returning patient ── */
function checkExistingSession() {
  try {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      if (user.name && document.getElementById('patient-name')) {
        document.getElementById('patient-name').value = user.name;
      }
      if (user.contact_number && document.getElementById('patient-phone')) {
        document.getElementById('patient-phone').value = user.contact_number;
      }
      if (user.email && document.getElementById('patient-email')) {
        document.getElementById('patient-email').value = user.email;
      }
    }
  } catch (_) {}
}

/* ── 4. Interactive Card Pickers ── */
function initCardPickers() {
  // Service Cards
  document.querySelectorAll('.service-choice-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.service-choice-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedService = {
        id: card.getAttribute('data-id') || '',
        name: card.getAttribute('data-name'),
        price: parseFloat(card.getAttribute('data-price')) || 0
      };
    });
  });

  // Dentist Cards
  document.querySelectorAll('.dentist-choice-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.dentist-choice-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedDentist = card.getAttribute('data-dentist');
    });
  });

  // Slot Buttons
  document.querySelectorAll('.slot-button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      document.querySelectorAll('.slot-button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTime = btn.getAttribute('data-time');
    });
  });
}

/* ── 5. Fetch Live Treatments from API ── */
async function loadLiveTreatments() {
  try {
    const res = await fetch(`${API_BASE}/treatments`);
    if (!res.ok) return;
    const treatments = await res.json();
    if (!Array.isArray(treatments) || treatments.length === 0) return;

    const container = document.getElementById('service-options-container');
    if (!container) return;

    container.innerHTML = '';
    treatments.forEach((t, idx) => {
      const card = document.createElement('div');
      card.className = `service-choice-card ${idx === 0 ? 'selected' : ''}`;
      card.setAttribute('data-id', t.id);
      card.setAttribute('data-name', t.name);
      card.setAttribute('data-price', t.price);

      const priceFmt = Number(t.price).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
      card.innerHTML = `
        <div>
          <div class="service-name">${escapeHtml(t.name)}</div>
          <div class="service-meta">${t.duration_minutes ? t.duration_minutes + ' mins • ' : ''}Professional Care</div>
        </div>
        <div class="service-price">${priceFmt}</div>
      `;

      if (idx === 0) {
        selectedService = { id: t.id, name: t.name, price: t.price };
      }

      card.addEventListener('click', () => {
        document.querySelectorAll('.service-choice-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedService = { id: t.id, name: t.name, price: t.price };
      });

      container.appendChild(card);
    });
  } catch (err) {
    console.warn('Using default treatments', err);
  }
}

/* ── 6. Live Occupied Slots Checking (Double-Booking Prevention) ── */
async function fetchOccupiedSlots(dateVal) {
  if (!dateVal) return;
  const slotButtons = document.querySelectorAll('.slot-button');

  try {
    const res = await fetch(`${API_BASE}/appointments/public-slots?date=${dateVal}`);
    if (!res.ok) throw new Error('Slot check failed');
    const data = await res.json();
    occupiedSlots = Array.isArray(data) ? data : [];

    const bookedTimes = new Set();
    occupiedSlots.forEach(item => {
      if (item.time) {
        // e.g. "09:00 AM" or "9:00 AM"
        const clean = item.time.trim().toUpperCase().replace(/^0/, '');
        bookedTimes.add(clean);
      }
    });

    slotButtons.forEach(btn => {
      const slotTime = btn.getAttribute('data-time').trim().toUpperCase().replace(/^0/, '');
      const isBooked = bookedTimes.has(slotTime);

      if (isBooked) {
        btn.disabled = true;
        btn.classList.remove('selected');
        btn.title = 'Occupied / Unavailable';
      } else {
        btn.disabled = false;
        btn.title = 'Available';
      }
    });

    // If currently selected slot is now disabled, reset selection
    const currentSelectedBtn = document.querySelector('.slot-button.selected');
    if (currentSelectedBtn && currentSelectedBtn.disabled) {
      currentSelectedBtn.classList.remove('selected');
      selectedTime = '';
    }
  } catch (err) {
    console.warn('Could not fetch occupied slots:', err);
  }
}

/* ── 7. Wizard Navigation & Validation ── */
function goToStep(step) {
  // Validate before advancing
  if (step > currentStep) {
    if (currentStep === 1) {
      const name = document.getElementById('patient-name')?.value.trim();
      const phone = document.getElementById('patient-phone')?.value.trim();
      const email = document.getElementById('patient-email')?.value.trim();

      if (!name) {
        alert('Please enter your full name.');
        document.getElementById('patient-name')?.focus();
        return;
      }
      if (!phone) {
        alert('Please enter your mobile phone number.');
        document.getElementById('patient-phone')?.focus();
        return;
      }
      if (!email || !email.includes('@')) {
        alert('Please provide a valid email address.');
        document.getElementById('patient-email')?.focus();
        return;
      }
    } else if (currentStep === 2) {
      if (!selectedService.name) {
        alert('Please select a dental treatment.');
        return;
      }
    } else if (currentStep === 3) {
      const dateVal = document.getElementById('appointment-date')?.value;
      if (!dateVal) {
        alert('Please choose an appointment date.');
        return;
      }
      if (!selectedTime) {
        alert('Please select an available time slot.');
        return;
      }

      // Populate review summary in Step 4
      populateSummary();
    }
  }

  // Switch Active Pane
  document.querySelectorAll('.wizard-pane').forEach((p, idx) => {
    p.style.display = (idx + 1 === step) ? 'block' : 'none';
  });

  // Update Progress Indicators
  for (let i = 1; i <= 4; i++) {
    const stepEl = document.getElementById(`pstep-${i}`);
    if (stepEl) {
      stepEl.classList.remove('active', 'completed');
      if (i === step) stepEl.classList.add('active');
      else if (i < step) stepEl.classList.add('completed');
    }
  }

  // Progress bar fill percentage
  const progressFill = document.getElementById('progress-bar-fill');
  if (progressFill) {
    const percent = ((step - 1) / 3) * 100;
    progressFill.style.width = `${percent}%`;
  }

  currentStep = step;
  window.scrollTo({ top: 120, behavior: 'smooth' });
}

/* ── 8. Summary Review Generator ── */
function populateSummary() {
  const name = document.getElementById('patient-name')?.value.trim() || '—';
  const branch = document.getElementById('clinic-branch')?.value || 'Makati Main Clinic';
  const dateVal = document.getElementById('appointment-date')?.value || '';

  const summaryName = document.getElementById('summary-patient-name');
  const summaryBranch = document.getElementById('summary-branch');
  const summaryService = document.getElementById('summary-service');
  const summaryDoctor = document.getElementById('summary-doctor');
  const summaryDateTime = document.getElementById('summary-datetime');

  if (summaryName) summaryName.textContent = name;
  if (summaryBranch) summaryBranch.textContent = branch;
  if (summaryService) summaryService.textContent = `${selectedService.name} (₱${Number(selectedService.price).toLocaleString()})`;
  if (summaryDoctor) summaryDoctor.textContent = selectedDentist;

  let formattedDate = dateVal;
  if (dateVal) {
    try {
      const d = new Date(dateVal + 'T00:00:00');
      formattedDate = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch (_) {}
  }
  if (summaryDateTime) summaryDateTime.textContent = `${formattedDate} @ ${selectedTime}`;
}

/* ── 9. Payment Method Selector ── */
function selectPaymentMethod(method) {
  selectedPayment = method;
  document.querySelectorAll('.payment-card').forEach(card => {
    card.classList.toggle('selected', card.getAttribute('data-method') === method);
  });
}

/* ── 10. Submit QR / Portal Booking ── */
async function submitQrBooking() {
  const btnSubmit = document.getElementById('btn-submit-qr-booking');
  const originalHtml = btnSubmit.innerHTML;
  btnSubmit.disabled = true;
  btnSubmit.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    <span>Processing Booking...</span>
  `;

  try {
    const name = document.getElementById('patient-name').value.trim();
    const phone = document.getElementById('patient-phone').value.trim();
    const email = document.getElementById('patient-email').value.trim();
    const branch = document.getElementById('clinic-branch').value;
    const dateVal = document.getElementById('appointment-date').value;
    const notes = document.getElementById('patient-notes')?.value.trim() || '';

    // Convert time to 24h ISO
    const [rawTime, modifier] = selectedTime.split(' ');
    let [hours, minutes] = rawTime.split(':');
    if (modifier === 'PM' && hours !== '12') hours = String(parseInt(hours, 10) + 12);
    if (modifier === 'AM' && hours === '12') hours = '00';
    const isoDateTime = `${dateVal}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00`;

    const payload = {
      name,
      contact_number: phone,
      email,
      branch,
      dentist_name: selectedDentist,
      treatment_id: selectedService.id || null,
      treatment_name: selectedService.name,
      appointment_date: isoDateTime,
      payment_method: selectedPayment,
      notes
    };

    const res = await fetch(`${API_BASE}/appointments/qr-book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Booking submission failed.');
    }

    // Success: Render Digital Pass
    renderConfirmationPass(data, payload);

  } catch (err) {
    alert(err.message || 'An error occurred while booking. Please try again.');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = originalHtml;
  }
}

/* ── 11. Render Digital Check-in Pass & QR Code ── */
function renderConfirmationPass(apiResult, formData) {
  const wizardCard = document.getElementById('booking-wizard-card');
  const passCard = document.getElementById('digital-pass-card');

  if (wizardCard) wizardCard.style.display = 'none';
  if (passCard) passCard.style.display = 'block';

  const refCode = apiResult.reference_code || 'APT-QR-' + Math.floor(100000 + Math.random() * 900000);

  safeText('pass-ref-code', refCode);
  safeText('pass-patient-name', formData.name);
  safeText('pass-branch', formData.branch);
  safeText('pass-service', selectedService.name);
  safeText('pass-dentist', selectedDentist);
  safeText('pass-datetime', `${formData.appointment_date.split('T')[0]} @ ${selectedTime}`);
  safeText('pass-payment-status', selectedPayment === 'cash' ? 'Pay at Front Desk' : 'Online Payment (PayMongo)');

  // Generate Check-In QR Code
  const qrContainer = document.getElementById('ticket-qr-canvas');
  if (qrContainer) {
    qrContainer.innerHTML = '';
    const qrData = JSON.stringify({
      ref: refCode,
      name: formData.name,
      phone: formData.contact_number,
      branch: formData.branch,
      treatment: selectedService.name,
      dentist: selectedDentist,
      time: selectedTime,
      date: formData.appointment_date
    });

    try {
      new QRCode(qrContainer, {
        text: qrData,
        width: 140,
        height: 140,
        colorDark: '#0b3c4d',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {
      console.warn('QR render error:', e);
    }
  }

  window.scrollTo({ top: 80, behavior: 'smooth' });
}

function safeText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
