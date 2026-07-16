import { registerSW } from 'virtual:pwa-register';

const LAZY_IMPORT_RELOAD_KEY = 'concourse.lazy-import-reload';
const LAZY_IMPORT_RELOAD_COOLDOWN_MS = 30_000;
let reloading = false;

// A stale tab can retain an old Vite entry module after Hosting has removed its
// matching hashed lazy chunk. Reload once to obtain the current release instead
// of leaving the 3D map or another lazy route permanently unavailable. Keep a
// short per-tab cooldown so a persistent network failure cannot cause a loop.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const previousReload = Number(sessionStorage.getItem(LAZY_IMPORT_RELOAD_KEY));
  if (Number.isFinite(previousReload) && Date.now() - previousReload < LAZY_IMPORT_RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(LAZY_IMPORT_RELOAD_KEY, String(Date.now()));
  window.location.reload();
});

registerSW({
  immediate: true,
  onNeedReload() {
    // autoUpdate activates the worker immediately. Reload once after it takes
    // control so an open tab cannot keep an entry module from an older release.
    if (reloading) return;
    reloading = true;
    window.location.reload();
  },
});
