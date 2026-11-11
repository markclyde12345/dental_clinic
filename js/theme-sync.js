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
})();
