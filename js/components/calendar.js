// Weekly calendar view for the dentist's appointments.
// Renders 7 day-columns with hourly rows and places appointment chips.

const CalendarView = (() => {
  const HOUR_START = 8;
  const HOUR_END = 19;
  let root = null;
  let onSelect = null;
  let currentStart = startOfWeek(new Date());
  let appointments = [];

  function startOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay(); // 0 = Sun
    const diff = date.getDate() - day;
    const ws = new Date(date.setDate(diff));
    ws.setHours(0, 0, 0, 0);
    return ws;
  }

  function fmtTime(d) {
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function fmtDayHeader(d) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function statusClass(status) {
    return 'appt-chip status-' + String(status).toLowerCase().replace(/\s+/g, '-');
  }

  function render() {
    if (!root) return;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const hours = [];
    for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

    let html = '<div class="cal-week">';
    // Header row
    html += '<div class="cal-row cal-header-row"><div class="cal-time-col"></div>';
    days.forEach(d => {
      const isToday = new Date().toDateString() === d.toDateString();
      html += `<div class="cal-day-head ${isToday ? 'is-today' : ''}">${fmtDayHeader(d)}</div>`;
    });
    html += '</div>';

    // Hour rows
    hours.forEach(h => {
      html += '<div class="cal-row">';
      html += `<div class="cal-time-col">${String(h % 12 === 0 ? 12 : h % 12)}:00 ${h < 12 ? 'AM' : 'PM'}</div>`;
      days.forEach(d => {
        const cellDate = new Date(d); cellDate.setHours(h, 0, 0, 0);
        const cellEnd = new Date(d); cellEnd.setHours(h + 1, 0, 0, 0);
        const chips = appointments.filter(a => {
          const ad = new Date(a.appointment_date);
          return ad >= cellDate && ad < cellEnd && sameDay(ad, d);
        });
        html += `<div class="cal-cell" data-date="${cellDate.toISOString()}">`;
        chips.forEach(a => {
          const patient = a.patient ? a.patient.name : 'Unknown';
          html += `<div class="${statusClass(a.status)}" data-appt="${a.id}" title="${patient} — ${fmtTime(a.appointment_date)}">
                     <span class="chip-time">${fmtTime(a.appointment_date)}</span>
                     <span class="chip-name">${patient}</span>
                   </div>`;
        });
        html += '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    root.innerHTML = html;

    // Wire clicks
    root.querySelectorAll('[data-appt]').forEach(el => {
      el.addEventListener('click', () => {
        const appt = appointments.find(a => a.id === el.getAttribute('data-appt'));
        if (appt && onSelect) onSelect(appt);
      });
    });
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function inViewWeek(appt) {
    const d = new Date(appt.appointment_date);
    const end = new Date(currentStart); end.setDate(end.getDate() + 7);
    return d >= currentStart && d < end;
  }

  return {
    init(el, opts = {}) {
      root = el;
      onSelect = opts.onSelect || null;
      currentStart = startOfWeek(new Date());
    },
    setAppointments(list) { appointments = (list || []).filter(inViewWeek); render(); },
    prev() { currentStart.setDate(currentStart.getDate() - 7); render(); },
    next() { currentStart.setDate(currentStart.getDate() + 7); render(); },
    refresh(list) { this.setAppointments(list); }
  };
})();

window.CalendarView = CalendarView;
