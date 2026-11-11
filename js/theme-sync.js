/* Shared theme sync: keeps html.dark-theme and body.dark-theme in step, persists choice, updates toggle icon. */
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
})();
