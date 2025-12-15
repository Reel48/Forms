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
  const KEY = 'forms:chunk_recovery_reload_v1';

  const alreadyReloaded = () => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  };

  const markReloaded = () => {
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      // ignore
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

  const reloadOnce = (reason: string) => {
    if (alreadyReloaded()) return;
    markReloaded();
    // eslint-disable-next-line no-console
    console.warn(`[chunk-recovery] Reloading once due to: ${reason}`);
    window.location.reload();
  };

  window.addEventListener('error', (event) => {
    const message =
      // Typical for SyntaxError / ChunkLoadError
      (event as ErrorEvent).message ||
      // Some browsers expose the error object
      ((event as ErrorEvent).error && String((event as ErrorEvent).error)) ||
      '';

    if (shouldReloadForError(message)) {
      reloadOnce(message);
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const message =
      (reason && typeof reason === 'object' && 'message' in (reason as any) && String((reason as any).message)) ||
      (typeof reason === 'string' ? reason : '') ||
      '';

    if (shouldReloadForError(message)) {
      reloadOnce(message);
    }
  });
}

installChunkLoadRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
