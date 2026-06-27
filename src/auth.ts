// Turnstile gate for the Life Admin Copilot demo. Replaces the retired password
// gate (plan §3.6). An invisible Cloudflare Turnstile check produces a token; we
// exchange it at /api/auth for a short-lived JWT. Same public interface as before
// (createLacAuth → { initialize, getAuthToken, handleUnauthorized }), so main.ts
// needs no changes. Reuses the portfolio's Turnstile widget (same site key).

const TOKEN_STORAGE_KEY = 'lac_token';
const TOKEN_EXPIRY_STORAGE_KEY = 'lac_token_expiry';
const AUTH_ENDPOINT = `${import.meta.env.VITE_GOOGLE_CLOUD_URL}/api/auth`;
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

// Minimal typing for the Turnstile global injected by api.js.
type Turnstile = {
  render: (el: HTMLElement | string, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};
declare global {
  interface Window { turnstile?: Turnstile; }
}

export type LacAuth = {
  initialize: () => void;
  getAuthToken: () => string | null;
  handleUnauthorized: () => void;
};

export function createLacAuth(onAuthenticated: () => void): LacAuth {
  let authToken: string | null = null;
  let widgetId: string | null = null;

  function clearStoredToken() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
  }

  function checkAuth(): boolean {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const expiry = sessionStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY);

    if (token && expiry) {
      if (Date.now() < parseInt(expiry, 10)) {
        authToken = token;
        return true;
      }
      clearStoredToken();
    }
    return false;
  }

  function showModal() {
    document.getElementById('turnstile-modal')?.classList.remove('hidden');
  }

  function hideModal() {
    document.getElementById('turnstile-modal')?.classList.add('hidden');
    document.getElementById('turnstile-error')?.classList.add('hidden');
  }

  function showError(message: string) {
    const errorEl = document.getElementById('turnstile-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }

  // Run cb once the Turnstile script (loaded async) is available.
  function whenTurnstileReady(cb: () => void) {
    if (window.turnstile) return cb();
    const timer = setInterval(() => {
      if (window.turnstile) {
        clearInterval(timer);
        cb();
      }
    }, 100);
  }

  function renderWidget() {
    const container = document.getElementById('turnstile-container');
    if (!container || !window.turnstile) return;

    if (widgetId !== null) {
      window.turnstile.reset(widgetId);
      return;
    }

    widgetId = window.turnstile.render(container, {
      sitekey: SITE_KEY,
      callback: (token: string) => exchangeToken(token),
      'error-callback': () => showError('Verification failed. Please refresh and try again.'),
      'expired-callback': () => window.turnstile?.reset(widgetId ?? undefined),
    });
  }

  async function exchangeToken(turnstileToken: string) {
    try {
      const response = await fetch(AUTH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: turnstileToken }),
      });

      if (!response.ok) {
        showError('Verification failed. Please refresh and try again.');
        return;
      }

      const data = await response.json();
      authToken = data.token;
      sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      sessionStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, String(Date.now() + data.expiresIn * 1000));

      hideModal();
      onAuthenticated();
    } catch (error) {
      console.error('Authentication error:', error);
      showError('Network error. Please refresh and try again.');
    }
  }

  function startVerification() {
    showModal();
    whenTurnstileReady(renderWidget);
  }

  function handleUnauthorized() {
    authToken = null;
    clearStoredToken();
    startVerification();
  }

  function initialize() {
    if (checkAuth()) onAuthenticated();
    else startVerification();
  }

  return { initialize, getAuthToken: () => authToken, handleUnauthorized };
}
