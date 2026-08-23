// Lightweight modal helper (backdrop + content injection).

const Modal = (() => {
  let root = null;

  function ensureRoot() {
    if (!root) root = document.getElementById('modal-root');
    return root;
  }

  return {
    open(html) {
      const r = ensureRoot();
      r.innerHTML = `
        <div class="modal-overlay" onclick="if(event.target===this) Modal.close()">
          ${html}
        </div>`;
      document.body.style.overflow = 'hidden';
    },
    close() {
      const r = ensureRoot();
      if (r) r.innerHTML = '';
      document.body.style.overflow = '';
    },
    getRoot() { return ensureRoot(); }
  };
})();

window.Modal = Modal;
