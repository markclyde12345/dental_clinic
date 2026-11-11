/**
 * Fano Dental Clinic — Main JavaScript
 * File: js/main.js
 */

/* ===== LOADER ===== */
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
  }, 1800);
});

/* ===== NAVBAR SCROLL ===== */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 40);
});

/* ===== MOBILE MENU ===== */
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const mobileClose = document.getElementById('mobileClose');

hamburger.addEventListener('click', () => mobileMenu.classList.add('open'));
mobileClose.addEventListener('click', () => mobileMenu.classList.remove('open'));

function closeMobileMenu() {
  mobileMenu.classList.remove('open');
}

/* ===== SCROLL REVEAL ===== */
const reveals = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

reveals.forEach(el => revealObserver.observe(el));

/* ===== SMOOTH ANCHOR SCROLL ===== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      
      // Instantly apply active state for click animation
      document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));
      this.classList.add('active');
      
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ===== REAL-TIME COUNTER & HERO STATS ===== */
function animateCounter(el, target, suffix = '', startFrom = 0, duration = 1200) {
  if (!el) return;
  if (el._animFrame) cancelAnimationFrame(el._animFrame);
  const safeTarget = Number.isFinite(target) ? target : 0;
  let start = 0;
  const step = timestamp => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    const current  = Math.round(startFrom + eased * (safeTarget - startFrom));
    el.textContent = current + suffix;
    if (progress < 1) {
      el._animFrame = requestAnimationFrame(step);
    } else {
      el.textContent = safeTarget + suffix;
      el._animFrame = null;
    }
  };
  el._animFrame = requestAnimationFrame(step);
}

function updateStatElement(el, newValue, suffix, animateInitial = false) {
  if (!el || !Number.isFinite(newValue)) return;
  const prevValue = el.dataset.liveValue !== undefined ? Number(el.dataset.liveValue) : null;
  el.dataset.liveValue = String(newValue);

  if (prevValue === null && animateInitial) {
    animateCounter(el, newValue, suffix, 0, 1200);
  } else if (prevValue !== null && prevValue !== newValue) {
    animateCounter(el, newValue, suffix, prevValue, 600);
  } else {
    if (el._animFrame) cancelAnimationFrame(el._animFrame);
    el.textContent = `${newValue}${suffix}`;
  }
}

async function fetchLiveHeroStats(isInitial = false) {
  const yearsStat = document.getElementById('years-exp-stat');
  const patientStat = document.getElementById('patient-count-stat');
  const satisfactionStat = document.getElementById('satisfaction-rate-stat');
  if (!yearsStat && !patientStat && !satisfactionStat) return;

  const baseOrigin = ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000' && window.location.port !== '') ? 'http://localhost:5000' : '';
  try {
    const res = await fetch(`${baseOrigin}/api/patients/count?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();

    const yearsVal = Number(data.yearsExperience) || Math.max(5, new Date().getFullYear() - 2021);
    const patientsVal = Number(data.count) || 0;
    const satisfactionVal = Number(data.satisfactionRate) || 98;

    updateStatElement(yearsStat, yearsVal, '+', isInitial);
    updateStatElement(patientStat, patientsVal, '+', isInitial);
    updateStatElement(satisfactionStat, satisfactionVal, '%', isInitial);
  } catch (err) {
    console.error('Failed to fetch real-time hero stats:', err);
  }
}

/* ===== SCROLL SPY ACTIVE MENU ===== */
const navLinks = document.querySelectorAll('.nav-links a:not(.nav-cta)');
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
  let current = '';
  const scrollPos = window.scrollY + 120; // offset for navbar height + buffer

  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    const sectionHeight = section.offsetHeight;
    if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
});

/* ===== DYNAMIC PATIENT COUNT & ACTIVE USER SESSION ===== */
document.addEventListener('DOMContentLoaded', () => {
  initLandingUserSession();
  fetchLiveHeroStats(true);

  // Real-time polling every 10 seconds + refresh when tab becomes visible
  setInterval(() => {
    if (!document.hidden) fetchLiveHeroStats(false);
  }, 10000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchLiveHeroStats(false);
  });

  window.addEventListener('focus', () => {
    fetchLiveHeroStats(false);
  });
});

/* ===== LANDING QR MODAL CONTROLLER ===== */
let landingQrInstance = null;

function getLandingPortalUrl() {
  const origin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
  const pathname = window.location.pathname || '';
  const basePath = pathname.substring(0, pathname.lastIndexOf('/pages'));
  
  if (origin && !origin.startsWith('file')) {
    return `${origin}${basePath}/pages/book-qr.html`;
  }
  return `book-qr.html`;
}

function generateLandingQr() {
  const qrBox = document.getElementById('landingQrBox');
  const urlInput = document.getElementById('landingQrUrlText');
  const directLink = document.getElementById('landingQrDirectLink');
  if (!qrBox) return;

  const targetUrl = getLandingPortalUrl();
  if (urlInput) urlInput.value = targetUrl;
  if (directLink) directLink.href = targetUrl;

  qrBox.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    landingQrInstance = new QRCode(qrBox, {
      text: targetUrl,
      width: 170,
      height: 170,
      colorDark: '#042f2e',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    qrBox.innerHTML = `<div style="padding:20px;text-align:center;color:#64748b;font-size:0.85rem;">QR Code ready.<br><a href="${targetUrl}" target="_blank" style="color:#0d9488;font-weight:700;">Open Portal</a></div>`;
  }
}

function openLandingQrModal() {
  const modal = document.getElementById('landingQrModal');
  if (!modal) return;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  generateLandingQr();
}

function closeLandingQrModal() {
  const modal = document.getElementById('landingQrModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function copyLandingQrUrl() {
  const urlInput = document.getElementById('landingQrUrlText');
  const copyBtn = document.getElementById('landingQrCopyBtn');
  if (!urlInput) return;

  navigator.clipboard.writeText(urlInput.value).then(() => {
    if (copyBtn) {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✓ Copied!';
      copyBtn.style.background = '#dcfce7';
      copyBtn.style.color = '#166534';
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '';
        copyBtn.style.color = '';
      }, 2000);
    }
  }).catch(err => {
    console.error('Clipboard copy failed:', err);
    urlInput.select();
    document.execCommand('copy');
  });
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLandingQrModal();
  }
});

/* ===== ACTIVE USER SESSION & DASHBOARD NAVIGATION ON LANDING PAGE ===== */
function initLandingUserSession() {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  let userInfo = null;
  try {
    const raw = localStorage.getItem('userInfo') || sessionStorage.getItem('userInfo');
    if (raw) userInfo = JSON.parse(raw);
  } catch (e) {
    userInfo = null;
  }

  // 30-day session expiry check
  const expiry = localStorage.getItem('sessionExpiry') || sessionStorage.getItem('sessionExpiry');
  if (expiry && Date.now() > parseInt(expiry, 10)) {
    // Expired after 30 days
    localStorage.removeItem('token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('sessionExpiry');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('userInfo');
    sessionStorage.removeItem('sessionExpiry');
    userInfo = null;
  }

  const isTestUser = window.location.search.includes('test_user=1');
  if (isTestUser && !userInfo) {
    userInfo = { name: 'Maria Santos', email: 'maria@example.com', role: 'Patient' };
  }

  const navAuthWrapper = document.getElementById('navAuthWrapper');
  const mobileAccountContainer = document.getElementById('mobileAccountContainer');
  const heroActions = document.getElementById('heroActions');

  const roleMap = {
    'Admin': 'admin-dashboard.html',
    'Dentist': 'dentist-dashboard.html',
    'Dental Assistant': 'dentist-dashboard.html',
    'Receptionist': 'receptionist-dashboard.html',
    'Accounting': 'accounting-dashboard.html',
    'Patient': 'patient-dashboard.html'
  };

  const isLoggedIn = !!((token && userInfo) || isTestUser);
  const userRole = userInfo?.role || 'Patient';
  const dashUrl = roleMap[userRole] || 'patient-dashboard.html';

  const rawName = userInfo?.name || userInfo?.fullName || (userInfo?.email ? userInfo.email.split('@')[0] : 'Patient');
  const initial = rawName.charAt(0).toUpperCase();

  const svgDashboard = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect></svg>`;
  const svgArrowRight = `<svg class="nav-arrow-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>`;
  const svgLogout = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M14 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2"></path><path d="M9 12h12l-3-3"></path><path d="m18 15 3-3"></path></svg>`;
  const svgUser = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="8" r="4"></circle><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"></path></svg>`;
  const svgCheckCircle = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="#0d9488" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>`;
  const svgCalendarPlus = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect x="4" y="5" width="16" height="16" rx="2"></rect><line x1="16" y1="3" x2="16" y2="7"></line><line x1="8" y1="3" x2="8" y2="7"></line><line x1="4" y1="11" x2="20" y2="11"></line><line x1="12" y1="14" x2="12" y2="18"></line><line x1="10" y1="16" x2="14" y2="16"></line></svg>`;

  // 1. Desktop / Tablet Navbar
  if (navAuthWrapper) {
    if (isLoggedIn) {
      navAuthWrapper.innerHTML = `
        <div class="nav-account-pill">
          <div class="nav-account-user" title="${escapeHtml(rawName)} (${userRole})">
            <div class="nav-account-avatar">${initial}</div>
            <div class="nav-account-info">
              <span class="nav-account-name">${escapeHtml(rawName)}</span>
              <span class="nav-account-status"><span class="nav-status-dot"></span> Active</span>
            </div>
          </div>
          <a href="${dashUrl}" class="btn-nav-dashboard" title="Return to ${userRole} Dashboard">
            ${svgDashboard}
            <span>Dashboard</span>
            ${svgArrowRight}
          </a>
          <button type="button" class="btn-nav-logout" onclick="landingLogout()" title="Sign Out">
            ${svgLogout}
          </button>
        </div>
      `;
    } else {
      navAuthWrapper.innerHTML = `
        <a href="login.html" class="btn-nav-login" title="Sign in to your account">
          ${svgUser}
          <span>Log In</span>
        </a>
      `;
    }
  }

  // 2. Mobile Drawer
  if (mobileAccountContainer) {
    if (isLoggedIn) {
      mobileAccountContainer.innerHTML = `
        <div class="mobile-account-card">
          <div class="mobile-account-header">
            <div class="mobile-account-avatar">${initial}</div>
            <div class="mobile-account-meta">
              <div class="mobile-account-name">${escapeHtml(rawName)}</div>
              <div class="mobile-account-status"><span class="nav-status-dot"></span> Active for 30 Days</div>
            </div>
          </div>
          <a href="${dashUrl}" class="btn-mobile-dash-cta" onclick="closeMobileMenu()">
            ${svgDashboard}
            <span>Go to Dashboard</span>
            ${svgArrowRight}
          </a>
          <button type="button" class="btn-mobile-signout" onclick="landingLogout()">
            ${svgLogout} Sign Out
          </button>
        </div>
      `;
    } else {
      mobileAccountContainer.innerHTML = `
        <div class="mobile-account-guest">
          <a href="login.html" class="btn-mobile-guest-login" onclick="closeMobileMenu()">
            ${svgUser}
            <span>Log In to Account</span>
          </a>
        </div>
      `;
    }
  }

  // 3. Hero Section CTA
  if (heroActions && isLoggedIn) {
    heroActions.innerHTML = `
      <div style="width: 100%; margin-bottom: 8px;">
        <div class="hero-account-badge">
          ${svgCheckCircle}
          <span>Welcome back, <strong>${escapeHtml(rawName)}</strong> (Logged In)</span>
        </div>
      </div>
      <a href="${dashUrl}" class="btn-primary">
        ${svgDashboard}
        <span>Go to Dashboard →</span>
      </a>
      <a href="#booking" class="btn-hero-secondary">
        ${svgCalendarPlus}
        <span>Book Appointment</span>
      </a>
    `;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}

window.landingLogout = function() {
  localStorage.removeItem('token');
  localStorage.removeItem('userInfo');
  localStorage.removeItem('sessionExpiry');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('userInfo');
  sessionStorage.removeItem('sessionExpiry');
  window.location.reload();
};


