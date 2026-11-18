// Pull to refresh, and the sync button without a full form post.
(() => {
  const form = document.querySelector('form[data-sync]');
  if (!form) return;
  const hint = document.querySelector('.pull');
  let busy = false;

  async function sync() {
    if (busy) return;
    busy = true;
    document.body.classList.add('syncing');
    try {
      await fetch('/sync', { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    } finally {
      location.reload();
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sync();
  });

  let startY = null;
  let pulled = 0;
  const THRESHOLD = 80;
  window.addEventListener('touchstart', (e) => {
    startY = window.scrollY <= 0 ? e.touches[0].clientY : null;
    pulled = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    pulled = Math.max(0, e.touches[0].clientY - startY);
    hint.classList.toggle('show', pulled > 20);
    hint.classList.toggle('ready', pulled > THRESHOLD);
  }, { passive: true });
  window.addEventListener('touchend', () => {
    hint.classList.remove('show', 'ready');
    if (startY !== null && pulled > THRESHOLD) sync();
    startY = null;
  });
})();
