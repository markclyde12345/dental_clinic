/**
 * Fano Dental Clinic — Offline Connectivity & Downtime Resilience Monitor
 * Displays real-time advisory banner when internet or server connectivity is interrupted.
 * Fallback contacts: (032) 489-1200 | +63 917 123 4567
 */
(function () {
  if (window.__clinicOfflineMonitorInitialized) return;
  window.__clinicOfflineMonitorInitialized = true;

  let banner = null;

  function createBanner() {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.id = 'clinic-offline-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999999;
      background: #7f1d1d;
      color: #fef2f2;
      padding: 10px 18px;
      font-size: 0.85rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 14px rgba(0,0,0,0.3);
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      line-height: 1.4;
    `;
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
        <span style="font-size: 1.25rem;">⚠️</span>
        <div>
          <strong>System Operating in Offline Mode:</strong> Internet or server connection is interrupted. 
          <span>For urgent appointments or assistance, contact clinic reception at <strong>(032) 489-1200</strong> or <strong>+63 917 123 4567</strong>.</span>
        </div>
      </div>
      <a href="/docs/downtime_procedure.md" target="_blank" style="color: #fecaca; text-decoration: underline; font-weight: 600; white-space: nowrap; font-size: 0.8rem;">Downtime SOP</a>
    `;
    document.body.appendChild(banner);
    return banner;
  }

  function showOffline() {
    const el = createBanner();
    el.style.background = '#7f1d1d';
    el.style.display = 'flex';
  }

  function showOnline() {
    if (!banner) return;
    banner.style.background = '#14532d';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; justify-content: center; width: 100%;">
        <span>✓</span>
        <strong>Connection Restored:</strong> Online services and clinical portals are synchronized.
      </div>
    `;
    setTimeout(() => {
      banner.style.display = 'none';
    }, 3500);
  }

  window.addEventListener('offline', showOffline);
  window.addEventListener('online', showOnline);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!navigator.onLine) showOffline();
    });
  } else {
    if (!navigator.onLine) showOffline();
  }
})();
