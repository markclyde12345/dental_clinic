// Weekly & Daily clinical calendar view for the dentist's appointments.
// Renders 7 day-columns (or 1 day in Day mode) with hourly rows and interactive appointment chips.

const CalendarView = (() => {
  const HOUR_START = 8;
  const HOUR_END = 19;
  let root = null;
  let onSelect = null;
  let currentDate = new Date();
  let currentStart = startOfWeek(new Date());
  let viewMode = 'week'; // 'week' | 'day'
  let allAppointments = [];

  function startOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0 = Sun
    const diff = date.getDate() - day;
    const ws = new Date(date.setDate(diff));
    ws.setHours(0, 0, 0, 0);
    return ws;
  }

  function fmtTime(d) {
    if (!d) return '--';
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function fmtHour(h) {
    const period = h < 12 ? 'AM' : 'PM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayHour).padStart(2, '0')}:00 ${period}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function statusClass(status) {
    return 'appt-chip status-' + String(status || 'pending').toLowerCase().replace(/\s+/g, '-');
  }

  function sameDay(a, b) {
    const da = new Date(a);
    const db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  }

  function updateTitle(days) {
    const titleEl = document.getElementById('cal-title');
    const subEl = document.getElementById('cal-subtitle');

    if (viewMode === 'day') {
      const d = days[0] || currentDate;
      if (titleEl) {
        titleEl.textContent = d.toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
        });
      }
      if (subEl) subEl.textContent = 'Daily Clinical Schedule';
    } else {
      if (!days.length) return;
      const start = days[0];
      const end = days[days.length - 1];
      const sMonth = start.toLocaleDateString('en-US', { month: 'short' });
      const eMonth = end.toLocaleDateString('en-US', { month: 'short' });
      const year = end.getFullYear();

      let rangeStr = '';
      if (sMonth === eMonth) {
        rangeStr = `${sMonth} ${start.getDate()} – ${end.getDate()}, ${year}`;
      } else {
        rangeStr = `${sMonth} ${start.getDate()} – ${eMonth} ${end.getDate()}, ${year}`;
      }

      if (titleEl) titleEl.textContent = rangeStr;
      if (subEl) subEl.textContent = '7-Day Clinical Schedule';
    }
  }

  function updateActiveToggle() {
    const btnWeek = document.getElementById('cal-view-week');
    const btnDay = document.getElementById('cal-view-day');
    if (btnWeek) btnWeek.classList.toggle('active', viewMode === 'week');
    if (btnDay) btnDay.classList.toggle('active', viewMode === 'day');
  }

  function render() {
    if (!root) return;

    updateActiveToggle();

    const days = [];
    if (viewMode === 'day') {
      days.push(new Date(currentDate));
    } else {
      for (let i = 0; i < 7; i++) {
        const d = new Date(currentStart);
        d.setDate(d.getDate() + i);
        days.push(d);
      }
    }

    updateTitle(days);

    const hours = [];
    for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

    const todayStr = new Date().toDateString();
    const isDayMode = viewMode === 'day';

    let html = `<div class="cal-week"><div class="cal-week-inner" style="${isDayMode ? 'min-width: 100%;' : ''}">`;

    // Header row
    html += `<div class="cal-row cal-header-row ${isDayMode ? 'is-day-mode' : ''}">`;
    html += `<div class="cal-time-col">TIME</div>`;
    days.forEach(d => {
      const isToday = (todayStr === d.toDateString());
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const monthShort = d.toLocaleDateString('en-US', { month: 'short' });

      html += `
        <div class="cal-day-head ${isToday ? 'is-today' : ''}">
          <span class="day-name">${isDayMode ? `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${monthShort}` : dayName}</span>
          <span class="day-num">${dayNum}</span>
        </div>
      `;
    });
    html += `</div>`;

    // Hour rows
    hours.forEach(h => {
      html += `<div class="cal-row ${isDayMode ? 'is-day-mode' : ''}">`;
      html += `<div class="cal-time-col">${fmtHour(h)}</div>`;

      days.forEach(d => {
        const cellDate = new Date(d); cellDate.setHours(h, 0, 0, 0);
        const cellEnd = new Date(d); cellEnd.setHours(h + 1, 0, 0, 0);
        const isToday = (todayStr === d.toDateString());

        const chips = allAppointments.filter(a => {
          if (!a.appointment_date) return false;
          const ad = new Date(a.appointment_date);
          return ad >= cellDate && ad < cellEnd && sameDay(ad, d);
        });

        html += `<div class="cal-cell ${isToday ? 'is-today-cell' : ''}" data-date="${cellDate.toISOString()}">`;
        chips.forEach(a => {
          const patient = a.patient ? (a.patient.name || 'Patient') : 'Patient';
          const treatment = a.treatment ? (a.treatment.name || 'Dental Consultation') : 'Consultation';
          const status = a.status || 'Pending';

          html += `
            <div class="${statusClass(status)}" data-appt="${a.id}" title="${escapeHtml(patient)} — ${escapeHtml(treatment)} (${fmtTime(a.appointment_date)})">
              <div class="chip-top">
                <span class="chip-time"><i class="fa-regular fa-clock"></i> ${fmtTime(a.appointment_date)}</span>
                <span class="chip-status-tag">${escapeHtml(status)}</span>
              </div>
              <span class="chip-name">${escapeHtml(patient)}</span>
              <span class="chip-treatment">${escapeHtml(treatment)}</span>
            </div>
          `;
        });
        html += `</div>`;
      });

      html += `</div>`;
    });

    html += `</div></div>`;
    root.innerHTML = html;

    // Wire appointment clicks
    root.querySelectorAll('[data-appt]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const apptId = el.getAttribute('data-appt');
        const appt = allAppointments.find(a => String(a.id) === String(apptId));
        if (appt && onSelect) onSelect(appt);
      });
    });
  }

  return {
    init(el, opts = {}) {
      root = el;
      onSelect = opts.onSelect || null;
      currentDate = new Date();
      currentStart = startOfWeek(currentDate);
      viewMode = 'week';
    },
    setAppointments(list) {
      allAppointments = Array.isArray(list) ? list : [];
      render();
    },
    prev() {
      if (viewMode === 'day') {
        currentDate.setDate(currentDate.getDate() - 1);
        currentStart = startOfWeek(currentDate);
      } else {
        currentStart.setDate(currentStart.getDate() - 7);
        currentDate = new Date(currentStart);
      }
      render();
    },
    next() {
      if (viewMode === 'day') {
        currentDate.setDate(currentDate.getDate() + 1);
        currentStart = startOfWeek(currentDate);
      } else {
        currentStart.setDate(currentStart.getDate() + 7);
        currentDate = new Date(currentStart);
      }
      render();
    },
    today() {
      currentDate = new Date();
      currentStart = startOfWeek(currentDate);
      render();
    },
    setViewMode(mode) {
      viewMode = mode;
      if (mode === 'day') {
        currentDate = new Date();
      } else {
        currentStart = startOfWeek(currentDate);
      }
      render();
    },
    refresh(list) {
      this.setAppointments(list);
    }
  };
})();

window.CalendarView = CalendarView;
