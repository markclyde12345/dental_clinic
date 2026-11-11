/* Shared theme sync + Real-Time Cloud Persistence & Cross-Dashboard Sync Engine */
(function () {
  var html = document.documentElement;
  var KEY = 'fano-theme';

  function toggleBtn() { return document.querySelector('.theme-toggle'); }

  function paintIcon(isDark) {
    var btn = toggleBtn();
    if (!btn) return;
    var fa = btn.querySelector('i.fa-solid, i.fas');
    if (fa) fa.className = 'fa-solid ' + (isDark ? 'fa-sun' : 'fa-moon');
    else btn.innerHTML = '<i class="ti ' + (isDark ? 'ti-sun' : 'ti-moon') + '"></i>';
    btn.setAttribute('title', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
  }

  function mirror() {
    var isDark = html.classList.contains('dark-theme');
    if (document.body) document.body.classList.toggle('dark-theme', isDark);
    paintIcon(isDark);
  }

  // Apply saved theme immediately (before paint) to avoid a flash
  if (localStorage.getItem(KEY) === 'dark') html.classList.add('dark-theme');

  new MutationObserver(function () {
    mirror();
    try { localStorage.setItem(KEY, html.classList.contains('dark-theme') ? 'dark' : 'light'); } catch (e) {}
  }).observe(html, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('DOMContentLoaded', mirror);
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) { html.classList.toggle('dark-theme', e.newValue === 'dark'); mirror(); }
  });

  /* ── Contrast guard: in dark mode, any text that is hard to read on its actual background
        is switched to white (or near-black on a light surface). Reverted when leaving dark mode. ── */
  var FIX = 'data-dm-fix';
  function parse(c) {
    var m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function bgOf(el) {
    var layers = [];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      var img = cs.backgroundImage;
      if (img && img !== 'none' && /gradient/.test(img)) {
        var g = img.match(/rgba?\([^)]+\)/);
        var gc = g && parse(g[0]);
        if (gc && gc.a > 0.5) { return gc; }
      }
      var c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        if (c.a >= 0.95) { layers.push(c); break; }
        layers.push(c);
      }
    }
    var base = { r: 13, g: 23, b: 30 };           // page background in dark mode
    if (layers.length && layers[layers.length - 1].a >= 0.95) base = layers.pop();
    for (var i = layers.length - 1; i >= 0; i--) {  // composite translucent layers
      var L = layers[i];
      base = { r: L.r * L.a + base.r * (1 - L.a), g: L.g * L.a + base.g * (1 - L.a), b: L.b * L.a + base.b * (1 - L.a) };
    }
    return base;
  }
  function hasText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return el.tagName === 'I' || el.tagName === 'svg';
  }
  function revert() {
    document.querySelectorAll('[' + FIX + ']').forEach(function (el) {
      var o = el.getAttribute(FIX);
      if (o) el.style.setProperty('color', o); else el.style.removeProperty('color');
      el.removeAttribute(FIX);
    });
  }
  function guard() {
    if (!html.classList.contains('dark-theme') || !document.body) { revert(); return; }
    var all = document.body.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'OPTION' || tag === 'IMG') continue;
      if (!hasText(el)) continue;
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var fg = parse(cs.color);
      if (!fg) continue;
      var bg = bgOf(el);
      if (contrast(fg, bg) >= 4) continue;
      var white = { r: 241, g: 245, b: 249 }, dark = { r: 15, g: 23, b: 42 };
      var pick = contrast(white, bg) >= contrast(dark, bg) ? '#f1f5f9' : '#0f172a';
      if (!el.hasAttribute(FIX)) el.setAttribute(FIX, el.style.getPropertyValue('color') || '');
      el.style.setProperty('color', pick, 'important');
    }
  }
  var timer;
  function schedule() { clearTimeout(timer); timer = setTimeout(function () { if (html.classList.contains('dark-theme')) guard(); }, 200); }
  new MutationObserver(function (list) {
    if (!html.classList.contains('dark-theme')) { revert(); return; }
    for (var i = 0; i < list.length; i++) { if (list[i].type !== 'attributes' || list[i].attributeName !== 'style') { schedule(); return; } }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('DOMContentLoaded', function () { setTimeout(guard, 300); });
  window.addEventListener('load', function () { setTimeout(guard, 500); });
  document.addEventListener('click', function () { setTimeout(guard, 350); }, true);
  new MutationObserver(function () { setTimeout(guard, 50); }).observe(html, { attributes: true, attributeFilter: ['class'] });

  /* ═══════════════════════════════════════════════════════════════════════════════
     REAL-TIME CLOUD SETTINGS & CROSS-DASHBOARD SYNCHRONIZATION ENGINE
     Automatically persists localStorage-based settings to Supabase (/api/settings)
     and synchronizes changes in real time across all 5 dashboards.
     ═══════════════════════════════════════════════════════════════════════════════ */
  var apiOrigin = (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port !== '5000' && window.location.port !== ''
  ) ? 'http://localhost:5000' : '';

  var rawSetItem = Storage.prototype.setItem;
  var isApplyingRemote = false;
  var syncPushTimer = null;
  var bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('fano_realtime_sync') : null;

  function getCurrentUserKey() {
    try {
      var u = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
      return u.id || u.email || 'anonymous';
    } catch (_) {
      return 'anonymous';
    }
  }

  function pushCloudSettings(scope, settingsObj, userKey) {
    var nativeFetch = window.__nativeFetch || window.fetch;
    if (!nativeFetch) return;
    nativeFetch(apiOrigin + '/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: scope, settings: settingsObj, userKey: userKey })
    }).then(function () {
      if (bc) {
        try { bc.postMessage({ type: 'settings_updated', scope: scope, ts: Date.now() }); } catch (_) {}
      }
    }).catch(function () {});
  }

  function collectAndPushClinicSettings() {
    var payload = {
      clinicName: localStorage.getItem('set-clinic-name') || 'Fano Dental Clinic',
      clinicEmail: localStorage.getItem('set-clinic-email') || 'contact@fanoclinic.com',
      clinicPhone: localStorage.getItem('set-clinic-phone') || '+63 917 123 4567',
      clinicHours: localStorage.getItem('set-clinic-hours') || '8:00 AM - 6:00 PM (Mon - Sat)',
      clinicAddress: localStorage.getItem('set-clinic-address') || '123 Dental Ave, Suite 100, Manila',
      autoApprove: localStorage.getItem('set-auto-approve') === 'true',
      smsAlerts: localStorage.getItem('set-sms-alerts') !== 'false',
      currency: localStorage.getItem('set-currency') || 'PHP (₱)',
      sessionTimeout: localStorage.getItem('set-session-timeout') || '30',
      auditVerbosity: localStorage.getItem('set-audit-verbosity') || 'Standard (Mutations Only)',
      twilioSid: localStorage.getItem('set-twilio-sid') || '',
      twilioPhone: localStorage.getItem('set-twilio-phone') || ''
    };
    pushCloudSettings('clinic', payload);
  }

  function collectAndPushFinanceSettings() {
    var payload = {
      currency: localStorage.getItem('acc-currency') || 'PHP (₱)',
      vatRate: localStorage.getItem('acc-vat') || '0',
      invPrefix: localStorage.getItem('acc-inv-prefix') || 'INV-',
      orPrefix: localStorage.getItem('acc-or-prefix') || 'OR-',
      clinicTin: localStorage.getItem('acc-clinic-tin') || '000-123-456-000 NV',
      birPermit: localStorage.getItem('acc-bir-permit') || 'FP-042026-0019283',
      receiptFooter: localStorage.getItem('acc-receipt-footer') || 'Thank you for trusting Fano Dental Clinic! Keep smiling.',
      autoEmailReceipt: localStorage.getItem('acc-auto-email-receipt') !== 'false',
      overdueAlert: localStorage.getItem('acc-overdue-alert') !== 'false',
      expenseAlert: localStorage.getItem('acc-expense-alert') !== 'false',
      dailyDigest: localStorage.getItem('acc-daily-digest') === 'true'
    };
    pushCloudSettings('finance', payload);
  }

  function collectAndPushPatientSettings() {
    var payload = {};
    var pdKeys = [
      'pd-email-notif', 'pd-sms-notif', 'pd-appt-remind', 'pd-billing-alert',
      'pd-promo-notif', 'pd-preferred-dentist', 'pd-preferred-time', 'pd-language',
      'pd-2fa', 'pd-share-history', 'pd-emergency-name', 'pd-emergency-phone'
    ];
    pdKeys.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v !== null) payload[k] = v;
    });
    pushCloudSettings('user', payload, getCurrentUserKey());
  }

  // Intercept localStorage.setItem so local setting writes automatically persist to Supabase
  Storage.prototype.setItem = function (key, value) {
    rawSetItem.call(this, key, value);
    if (this !== window.localStorage || isApplyingRemote || !key) return;

    if (key.indexOf('set-') === 0 && key !== 'set-dark-mode') {
      clearTimeout(syncPushTimer);
      syncPushTimer = setTimeout(collectAndPushClinicSettings, 250);
    } else if (key.indexOf('acc-') === 0) {
      clearTimeout(syncPushTimer);
      syncPushTimer = setTimeout(collectAndPushFinanceSettings, 250);
    } else if (key === 'fano_dentist_settings') {
      try {
        var parsed = JSON.parse(value);
        pushCloudSettings('dentist', parsed, getCurrentUserKey());
      } catch (_) {}
    } else if (key.indexOf('pd-') === 0) {
      clearTimeout(syncPushTimer);
      syncPushTimer = setTimeout(collectAndPushPatientSettings, 250);
    }
  };

  function setLocalSilent(key, val) {
    if (val === undefined || val === null) return;
    var strVal = String(val);
    if (localStorage.getItem(key) !== strVal) {
      rawSetItem.call(localStorage, key, strVal);
    }
  }

  function pullCloudSettings() {
    var nativeFetch = window.__nativeFetch || window.fetch;
    if (!nativeFetch) return;
    var userKey = getCurrentUserKey();
    nativeFetch(apiOrigin + '/api/settings?userKey=' + encodeURIComponent(userKey))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        isApplyingRemote = true;
        try {
          if (data.clinic) {
            var c = data.clinic;
            if (c.clinicName) setLocalSilent('set-clinic-name', c.clinicName);
            if (c.clinicEmail) setLocalSilent('set-clinic-email', c.clinicEmail);
            if (c.clinicPhone) setLocalSilent('set-clinic-phone', c.clinicPhone);
            if (c.clinicHours) setLocalSilent('set-clinic-hours', c.clinicHours);
            if (c.clinicAddress) setLocalSilent('set-clinic-address', c.clinicAddress);
            if (c.autoApprove !== undefined) setLocalSilent('set-auto-approve', c.autoApprove);
            if (c.smsAlerts !== undefined) setLocalSilent('set-sms-alerts', c.smsAlerts);
            if (c.currency) setLocalSilent('set-currency', c.currency);
            if (c.sessionTimeout) setLocalSilent('set-session-timeout', c.sessionTimeout);
            if (c.auditVerbosity) setLocalSilent('set-audit-verbosity', c.auditVerbosity);

            // Update DOM inputs if visible and not actively focused
            var active = document.activeElement;
            var mapDom = {
              'set-clinic-name': c.clinicName,
              'set-clinic-email': c.clinicEmail,
              'set-clinic-phone': c.clinicPhone,
              'set-clinic-hours': c.clinicHours,
              'set-clinic-address': c.clinicAddress,
              'set-currency': c.currency
            };
            Object.keys(mapDom).forEach(function (id) {
              var el = document.getElementById(id);
              if (el && el !== active && mapDom[id] !== undefined) el.value = mapDom[id];
            });
            var aaEl = document.getElementById('set-auto-approve');
            if (aaEl && aaEl !== active && c.autoApprove !== undefined) aaEl.checked = !!c.autoApprove;
            var smsEl = document.getElementById('set-sms-alerts');
            if (smsEl && smsEl !== active && c.smsAlerts !== undefined) smsEl.checked = !!c.smsAlerts;
          }

          if (data.finance) {
            var f = data.finance;
            if (f.currency) setLocalSilent('acc-currency', f.currency);
            if (f.vatRate !== undefined) setLocalSilent('acc-vat', f.vatRate);
            if (f.invPrefix) setLocalSilent('acc-inv-prefix', f.invPrefix);
            if (f.orPrefix) setLocalSilent('acc-or-prefix', f.orPrefix);
            if (f.clinicTin) setLocalSilent('acc-clinic-tin', f.clinicTin);
            if (f.birPermit) setLocalSilent('acc-bir-permit', f.birPermit);
            if (f.receiptFooter) setLocalSilent('acc-receipt-footer', f.receiptFooter);
            if (f.autoEmailReceipt !== undefined) setLocalSilent('acc-auto-email-receipt', f.autoEmailReceipt);
            if (f.overdueAlert !== undefined) setLocalSilent('acc-overdue-alert', f.overdueAlert);
            if (f.expenseAlert !== undefined) setLocalSilent('acc-expense-alert', f.expenseAlert);
            if (f.dailyDigest !== undefined) setLocalSilent('acc-daily-digest', f.dailyDigest);
          }

          if (data.dentist) {
            var dSettings = data.dentist[userKey] || data.dentist.default || (data.dentist.chair ? data.dentist : null);
            if (dSettings && Object.keys(dSettings).length > 0) {
              setLocalSilent('fano_dentist_settings', JSON.stringify(dSettings));
            }
          }

          if (data.userPreferences && typeof data.userPreferences === 'object') {
            Object.keys(data.userPreferences).forEach(function (k) {
              if (k.indexOf('pd-') === 0) {
                setLocalSilent(k, data.userPreferences[k]);
              }
            });
          }
        } finally {
          isApplyingRemote = false;
        }
      })
      .catch(function () {});
  }

  // Trigger live data refresh across all open dashboards when any API mutation happens
  function triggerDashboardRefresh() {
    try {
      if (typeof window.fetchLiveAppointments === 'function') window.fetchLiveAppointments();
      if (typeof window.fetchLiveDentists === 'function') window.fetchLiveDentists();
      if (typeof window.loadTreatments === 'function') window.loadTreatments();
      if (typeof window.loadInvoices === 'function') window.loadInvoices();
      if (typeof window.loadExpenses === 'function') window.loadExpenses();
      if (typeof window.loadOverviewData === 'function') window.loadOverviewData();
      if (typeof window.loadAppointments === 'function') window.loadAppointments();
      if (typeof window.loadPatientBilling === 'function') window.loadPatientBilling();
      if (typeof window.loadServicesCatalog === 'function') window.loadServicesCatalog();
      if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
      if (typeof window.loadQueue === 'function') window.loadQueue();
    } catch (_) {}
  }

  // Wrap fetch to broadcast mutations (POST/PUT/PATCH/DELETE) to other open tabs immediately
  if (window.fetch && !window.__nativeFetch) {
    window.__nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var method = ((init && init.method) || 'GET').toUpperCase();
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      return window.__nativeFetch(input, init).then(function (response) {
        if (response && response.ok && method !== 'GET' && (url.indexOf('/api/') !== -1 || url.indexOf('/appointments') !== -1 || url.indexOf('/invoices') !== -1 || url.indexOf('/treatments') !== -1 || url.indexOf('/patients') !== -1 || url.indexOf('/dentists') !== -1 || url.indexOf('/admin') !== -1 || url.indexOf('/expenses') !== -1)) {
          try {
            rawSetItem.call(localStorage, 'fano_last_mutation', String(Date.now()));
            if (bc) bc.postMessage({ type: 'api_mutation', url: url, method: method, ts: Date.now() });
          } catch (_) {}
        }
        return response;
      });
    };
  }

  if (bc) {
    bc.onmessage = function (ev) {
      if (!ev || !ev.data) return;
      if (ev.data.type === 'settings_updated') pullCloudSettings();
      if (ev.data.type === 'api_mutation') triggerDashboardRefresh();
    };
  }

  window.addEventListener('storage', function (e) {
    if (e.key === 'fano_last_mutation') {
      triggerDashboardRefresh();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    pullCloudSettings();
    // Poll cloud settings & keep dashboard synchronized in real time
    setInterval(pullCloudSettings, 12000);
  });

  window.addEventListener('focus', function () {
    pullCloudSettings();
    triggerDashboardRefresh();
  });
})();
