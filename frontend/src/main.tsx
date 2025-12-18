import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

/**
 * Guard against blank screens caused by stale HTML + missing lazy-loaded chunks after a deploy.
 *
 * Symptom in console:
 * - "Uncaught SyntaxError: Unexpected token '<'" (HTML returned for a missing JS chunk)
 * - "Failed to fetch dynamically imported module"
 * - "Loading chunk <n> failed"
 *
 * Behavior:
 * - Reloads the page once per tab session to fetch the latest HTML/assets.
 */
function installChunkLoadRecovery() {
  const KEY = 'forms:chunk_recovery_reload_v2';
  let reloadCount = 0;
  const MAX_RELOADS = 2; // Allow up to 2 reloads per session

  const getReloadCount = () => {
    try {
      return parseInt(sessionStorage.getItem(KEY) || '0', 10);
    } catch {
      return 0;
    }
  };

  const incrementReloadCount = () => {
    try {
      const count = getReloadCount() + 1;
      sessionStorage.setItem(KEY, count.toString());
      return count;
    } catch {
      return 0;
    }
  };

  const msgMatches = (msg: string) => {
    const m = msg.toLowerCase();
    return (
      m.includes("unexpected token '<'") ||
      m.includes('failed to fetch dynamically imported module') ||
      m.includes('loading chunk') ||
      m.includes('chunkloaderror') ||
      m.includes('importing a module script failed')
    );
  };

  const shouldReloadForError = (message?: unknown) => {
    if (typeof message !== 'string') return false;
    return msgMatches(message);
  };

  const reloadIfNeeded = (reason: string) => {
    reloadCount = getReloadCount();
    if (reloadCount >= MAX_RELOADS) {
      console.warn(`[chunk-recovery] Max reloads (${MAX_RELOADS}) reached. Not reloading again.`);
      return;
    }
    incrementReloadCount();
    // eslint-disable-next-line no-console
    console.warn(`[chunk-recovery] Reloading (${reloadCount}/${MAX_RELOADS}) due to: ${reason}`);
    // Clear cache before reload
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      });
    }
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  window.addEventListener('error', (event) => {
    const message =
      // Typical for SyntaxError / ChunkLoadError
      (event as ErrorEvent).message ||
      // Some browsers expose the error object
      ((event as ErrorEvent).error && String((event as ErrorEvent).error)) ||
      '';

    if (shouldReloadForError(message)) {
      reloadIfNeeded(message);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const message =
      (reason && typeof reason === 'object' && 'message' in (reason as any) && String((reason as any).message)) ||
      (typeof reason === 'string' ? reason : '') ||
      '';

    if (shouldReloadForError(message)) {
      reloadIfNeeded(message);
    }
  });
}

installChunkLoadRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
