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

/* ===== COUNTER ANIMATION ===== */
function animateCounter(el, target, suffix = '') {
  let start = 0;
  const duration = 1800;
  const step = timestamp => {
    if (!start) start = timestamp;
    const progress = Math.min((timestamp - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * target) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Trigger counters when hero stats scroll into view
const statsObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      document.querySelectorAll('.hero-stat-num').forEach(el => {
        const text   = el.textContent;
        const num    = parseInt(text);
        const suffix = text.replace(num, '');
        animateCounter(el, num, suffix);
      });
      statsObserver.disconnect();
    }
  });
}, { threshold: 0.5 });

const statsSection = document.querySelector('.hero-stats');
if (statsSection) statsObserver.observe(statsSection);

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

/* ===== DYNAMIC PATIENT COUNT ===== */
document.addEventListener('DOMContentLoaded', () => {
  const patientStat = document.getElementById('patient-count-stat');
  if (patientStat) {
    const baseOrigin = ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '5000' && window.location.port !== '') ? 'http://localhost:5000' : '';
    fetch(`${baseOrigin}/api/patients/count`)
      .then(res => res.json())
      .then(data => {
        // Set the text content to the real number of patients from the DB
        patientStat.textContent = `${data.count || 0}+`;
      })
      .catch(err => {
        console.error('Failed to fetch patient count:', err);
      });
  }
});

/* ===== LANDING QR MODAL CONTROLLER ===== */
let landingQrInstance = null;

function getLandingPortalUrl() {
  const branchSelect = document.getElementById('landingBranchSelect');
  const branch = branchSelect ? branchSelect.value : 'Main Clinic - Naga City';
  const origin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
  const pathname = window.location.pathname || '';
  const basePath = pathname.substring(0, pathname.lastIndexOf('/pages'));
  
  if (origin && !origin.startsWith('file')) {
    return `${origin}${basePath}/pages/book-qr.html?branch=${encodeURIComponent(branch)}`;
  }
  return `book-qr.html?branch=${encodeURIComponent(branch)}`;
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

