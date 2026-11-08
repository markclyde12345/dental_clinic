/**
 * Skeleton Loading Engine
 * Generates realistic shimmering skeleton screens for tables, cards, modals, and lists.
 * Features:
 *  - Soft, elegant light gray shimmer (never too dark).
 *  - Smart Grace Period & Network Detection: only shows loading skeleton if internet is slow or latency > 220ms.
 */

const Skeleton = (() => {
  function getVarWidth(base, variance, index) {
    const delta = ((index * 37) % (variance * 2 + 1)) - variance;
    return Math.max(30, base + delta);
  }

  /**
   * Detects whether the user is on a slow connection (2G, 3G, high latency, or Data Saver)
   */
  function isSlowConnection() {
    if (typeof navigator === 'undefined') return false;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    return conn.saveData === true ||
           conn.effectiveType === 'slow-2g' ||
           conn.effectiveType === '2g' ||
           conn.effectiveType === '3g' ||
           (typeof conn.rtt === 'number' && conn.rtt > 260) ||
           (typeof conn.downlink === 'number' && conn.downlink < 1.5);
  }

  // Update root class for CSS-level slow network awareness
  function syncConnectionState() {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.classList.toggle('is-slow-connection', isSlowConnection());
    }
  }

  if (typeof navigator !== 'undefined') {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.addEventListener) {
      conn.addEventListener('change', syncConnectionState);
    }
  }
  syncConnectionState();

  const engine = {
    isSlowConnection,

    /**
     * Smart Loader: Only reveals skeleton if network request takes longer than grace delay
     * or if user has slow internet.
     * @param {HTMLElement|string} target - Target element or selector
     * @param {function|string} skeletonContent - Generator function or HTML string
     * @param {number} delayMs - Delay in ms before skeleton appears (default: 220ms)
     * @returns {function} cancel function to stop skeleton from appearing
     */
    show(target, skeletonContent, delayMs = 220) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return () => {};

      const getContent = () => typeof skeletonContent === 'function' ? skeletonContent() : skeletonContent;

      if (isSlowConnection()) {
        // Slow internet: display immediately
        el.innerHTML = getContent();
        return () => {};
      }

      // Fast internet: hold off for grace period
      let cancelled = false;
      const timer = setTimeout(() => {
        if (!cancelled && el) {
          el.innerHTML = getContent();
        }
      }, delayMs);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    },

    /**
     * Generates skeleton <tr> rows for HTML <table> bodies
     * @param {number} cols - Number of columns
     * @param {number} rows - Number of rows (default 4)
     * @param {object} opts - { hasTime, hasAvatar, hasBadge, hasAction }
     */
    tableRows(cols = 5, rows = 4, opts = {}) {
      let html = '';
      for (let r = 0; r < rows; r++) {
        html += `<tr class="skeleton-tr">`;
        for (let c = 0; c < cols; c++) {
          let cellContent = '';

          // Column 0: Time or Date or standard ID
          if (c === 0 && (opts.hasTime !== false)) {
            cellContent = `
              <div class="skeleton skeleton-bar" style="width: ${getVarWidth(75, 10, r)}px; height: 13px; margin-bottom: 5px;"></div>
              <div class="skeleton skeleton-bar" style="width: ${getVarWidth(50, 8, r)}px; height: 10px;"></div>
            `;
          }
          // Column 1: Patient / User info with avatar
          else if ((c === 1 || (c === 0 && opts.hasTime === false)) && (opts.hasAvatar !== false)) {
            cellContent = `
              <div style="display: flex; align-items: center; gap: 10px;">
                <div class="skeleton skeleton-circle" style="width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;"></div>
                <div style="flex: 1; min-width: 0;">
                  <div class="skeleton skeleton-bar" style="width: ${getVarWidth(110, 20, r)}px; height: 13px; margin-bottom: 5px;"></div>
                  <div class="skeleton skeleton-bar" style="width: ${getVarWidth(80, 15, r)}px; height: 10px;"></div>
                </div>
              </div>
            `;
          }
          // Second to last column: Status Badge
          else if (c === cols - 2 && (opts.hasBadge !== false)) {
            cellContent = `<div class="skeleton skeleton-pill" style="width: ${getVarWidth(76, 8, r)}px; height: 22px; border-radius: 20px;"></div>`;
          }
          // Last column: Action button
          else if (c === cols - 1 && (opts.hasAction !== false)) {
            cellContent = `<div class="skeleton skeleton-btn" style="width: 88px; height: 28px; border-radius: 8px;"></div>`;
          }
          // Standard text column (e.g. Procedure, Notes, Contact, Fee)
          else {
            const w1 = getVarWidth(110 + (c * 15), 25, r + c);
            const w2 = getVarWidth(70 + (c * 10), 15, r * 2 + c);
            cellContent = `
              <div class="skeleton skeleton-bar" style="width: ${w1}px; height: 13px; margin-bottom: 5px;"></div>
              <div class="skeleton skeleton-bar" style="width: ${w2}px; height: 10px;"></div>
            `;
          }

          html += `<td class="skeleton-td" style="padding: 13px 16px; vertical-align: middle;">${cellContent}</td>`;
        }
        html += `</tr>`;
      }
      return html;
    },

    /**
     * Generates card skeletons for grids (Services, Patients, Invoices)
     * @param {number} count - Number of cards
     * @param {'service'|'patient'|'generic'} type - Card variant
     */
    cards(count = 3, type = 'generic') {
      let html = '';
      for (let i = 0; i < count; i++) {
        if (type === 'service') {
          html += `
            <div class="skeleton-card" style="background: var(--surface-color, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px;">
              <div class="skeleton" style="width: 100%; height: 140px; border-radius: 12px; margin-bottom: 4px;"></div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div class="skeleton skeleton-bar" style="width: ${getVarWidth(130, 20, i)}px; height: 18px;"></div>
                <div class="skeleton skeleton-pill" style="width: 65px; height: 22px; border-radius: 20px;"></div>
              </div>
              <div class="skeleton skeleton-bar" style="width: 90%; height: 12px;"></div>
              <div class="skeleton skeleton-bar" style="width: 70%; height: 12px;"></div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 10px;">
                <div class="skeleton skeleton-bar" style="width: 75px; height: 18px;"></div>
                <div class="skeleton skeleton-btn" style="width: 95px; height: 34px; border-radius: 8px;"></div>
              </div>
            </div>
          `;
        } else if (type === 'patient') {
          html += `
            <div class="skeleton-card" style="background: var(--surface-color, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 18px;">
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
                <div class="skeleton skeleton-circle" style="width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;"></div>
                <div style="flex: 1;">
                  <div class="skeleton skeleton-bar" style="width: ${getVarWidth(130, 20, i)}px; height: 16px; margin-bottom: 6px;"></div>
                  <div class="skeleton skeleton-bar" style="width: ${getVarWidth(90, 15, i)}px; height: 11px;"></div>
                </div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
                <div class="skeleton" style="height: 40px; border-radius: 8px;"></div>
                <div class="skeleton" style="height: 40px; border-radius: 8px;"></div>
              </div>
              <div class="skeleton skeleton-btn" style="width: 100%; height: 34px; border-radius: 8px;"></div>
            </div>
          `;
        } else {
          html += `
            <div class="skeleton-card" style="background: var(--surface-color, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 10px;">
              <div class="skeleton skeleton-bar" style="width: 40%; height: 16px;"></div>
              <div class="skeleton skeleton-bar" style="width: 85%; height: 12px;"></div>
              <div class="skeleton skeleton-bar" style="width: 65%; height: 12px;"></div>
              <div class="skeleton" style="width: 100%; height: 38px; border-radius: 8px; margin-top: 6px;"></div>
            </div>
          `;
        }
      }
      return html;
    },

    /**
     * Generates KPI / Stat metrics cards skeleton
     * @param {number} count - Number of stat cards
     */
    stats(count = 4) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="skeleton-card" style="background: var(--surface-color, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 14px; padding: 20px; display: flex; align-items: center; justify-content: space-between;">
            <div style="flex: 1;">
              <div class="skeleton skeleton-bar" style="width: 85px; height: 12px; margin-bottom: 10px;"></div>
              <div class="skeleton skeleton-bar" style="width: 65px; height: 26px; margin-bottom: 6px;"></div>
              <div class="skeleton skeleton-bar" style="width: 110px; height: 11px;"></div>
            </div>
            <div class="skeleton skeleton-circle" style="width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0;"></div>
          </div>
        `;
      }
      return html;
    },

    /**
     * Generates Modal skeleton (Clinical Workspace / View Details / EMR)
     * @param {'workspace'|'emr'} type - Modal variant
     */
    modal(type = 'workspace') {
      return `
        <div class="modal-body cw-vd-modal skeleton-modal-body" style="background: #ffffff !important; border-radius: 20px !important; padding: 28px 32px !important; max-width: 680px; width: 95vw; border-top: 4px solid #0d9488 !important; box-shadow: 0 25px 70px rgba(0,0,0,0.12) !important;">
          <!-- Top Header Row -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid #f1f5f9; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="skeleton" style="width: 44px; height: 44px; border-radius: 12px;"></div>
              <div>
                <div class="skeleton skeleton-bar" style="width: 170px; height: 18px; margin-bottom: 6px;"></div>
                <div class="skeleton skeleton-bar" style="width: 220px; height: 12px;"></div>
              </div>
            </div>
            <div class="skeleton skeleton-circle" style="width: 34px; height: 34px; border-radius: 50%;"></div>
          </div>

          <!-- Patient Banner -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 14px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <div class="skeleton skeleton-circle" style="width: 50px; height: 50px; border-radius: 14px;"></div>
              <div>
                <div class="skeleton skeleton-bar" style="width: 150px; height: 17px; margin-bottom: 8px;"></div>
                <div style="display: flex; gap: 12px;">
                  <div class="skeleton skeleton-bar" style="width: 95px; height: 12px;"></div>
                  <div class="skeleton skeleton-bar" style="width: 130px; height: 12px;"></div>
                </div>
              </div>
            </div>
            <div class="skeleton skeleton-pill" style="width: 90px; height: 26px; border-radius: 20px;"></div>
          </div>

          <!-- Specifications 4-Tile Grid -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px;">
            <div class="skeleton" style="height: 72px; border-radius: 12px;"></div>
            <div class="skeleton" style="height: 72px; border-radius: 12px;"></div>
            <div class="skeleton" style="height: 72px; border-radius: 12px;"></div>
            <div class="skeleton" style="height: 72px; border-radius: 12px;"></div>
          </div>

          <!-- Notes Box -->
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; margin-bottom: 20px;">
            <div class="skeleton skeleton-bar" style="width: 140px; height: 13px; margin-bottom: 10px;"></div>
            <div class="skeleton skeleton-bar" style="width: 95%; height: 13px; margin-bottom: 6px;"></div>
            <div class="skeleton skeleton-bar" style="width: 70%; height: 13px;"></div>
          </div>

          <!-- Footer Action Row -->
          <div style="display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid #f1f5f9;">
            <div class="skeleton skeleton-btn" style="width: 80px; height: 36px; border-radius: 8px;"></div>
          </div>
        </div>
      `;
    },

    /**
     * Generates Queue Chair widget skeleton
     */
    chair() {
      return `
        <div style="background: #f8fafc; border-radius: 14px; padding: 20px; border: 1px solid #e2e8f0;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
            <div>
              <div class="skeleton skeleton-bar" style="width: 120px; height: 12px; margin-bottom: 8px;"></div>
              <div class="skeleton skeleton-bar" style="width: 180px; height: 18px; margin-bottom: 6px;"></div>
              <div class="skeleton skeleton-bar" style="width: 140px; height: 12px;"></div>
            </div>
            <div class="skeleton skeleton-pill" style="width: 90px; height: 26px; border-radius: 20px;"></div>
          </div>
          <div class="skeleton skeleton-btn" style="width: 100%; height: 38px; border-radius: 8px;"></div>
        </div>
      `;
    },

    /**
     * Generates list item skeletons (notifications, activity feeds, roster)
     * @param {number} count - Number of list items
     */
    list(count = 4) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border-color, #f1f5f9);">
            <div class="skeleton skeleton-circle" style="width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;"></div>
            <div style="flex: 1;">
              <div class="skeleton skeleton-bar" style="width: ${getVarWidth(130, 20, i)}px; height: 13px; margin-bottom: 5px;"></div>
              <div class="skeleton skeleton-bar" style="width: ${getVarWidth(90, 15, i)}px; height: 10px;"></div>
            </div>
            <div class="skeleton skeleton-pill" style="width: 50px; height: 18px; border-radius: 12px;"></div>
          </div>
        `;
      }
      return html;
    },

    /**
     * Automatically hydrates initial loading states in the DOM into sleek skeleton screens
     */
    hydrate() {
      // 1. Any tbody with loading placeholders or empty-table-row
      document.querySelectorAll('tbody').forEach(tbody => {
        const text = tbody.textContent || '';
        if (text.includes('Loading') || tbody.querySelector('.table-loading, .ti-loader-2, .empty-table-row')) {
          const colCount = tbody.closest('table')?.querySelectorAll('thead th')?.length || 6;
          tbody.innerHTML = engine.tableRows(colCount, 4);
        }
      });

      // 2. Services catalog grid
      const servicesGrid = document.getElementById('patient-services-catalog-grid');
      if (servicesGrid && (servicesGrid.textContent.includes('Loading') || servicesGrid.querySelector('.ti-loader-2'))) {
        servicesGrid.innerHTML = engine.cards(6, 'service');
      }

      // 3. Patients grid
      document.querySelectorAll('#patients-grid, #patient-cards-grid').forEach(patientsGrid => {
        if (patientsGrid && (patientsGrid.textContent.includes('Loading') || patientsGrid.querySelector('.table-loading, .ti-loader-2'))) {
          patientsGrid.innerHTML = engine.cards(6, 'patient');
        }
      });

      // 4. Staff roster & duty grids
      document.querySelectorAll('#duty-dentists-grid, #staff-list-container, #overview-dentists-list').forEach(el => {
        if (el && (el.textContent.includes('Loading') || el.querySelector('.ti-loader-2'))) {
          el.innerHTML = engine.cards(3, 'patient');
        }
      });

      // 5. Activity feeds
      document.querySelectorAll('#activity-feed, #recent-activity-container').forEach(el => {
        if (el && el.textContent.includes('Loading')) {
          el.innerHTML = engine.list(4);
        }
      });
    }
  };

  // Run initial hydration automatically when script loads or DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => engine.hydrate());
    } else {
      setTimeout(() => engine.hydrate(), 0);
    }
  }

  return engine;
})();

window.Skeleton = Skeleton;
