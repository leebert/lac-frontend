const TOKEN_STORAGE_KEY = 'lac_token';
const TOKEN_EXPIRY_STORAGE_KEY = 'lac_token_expiry';
const AUTH_ENDPOINT = `${import.meta.env.VITE_GOOLGE_CLOUD_URL}/api/auth`;

export type LacAuth = {
  initialize: () => void;
  getAuthToken: () => string | null;
  handleUnauthorized: () => void;
};

export function createLacAuth(onAuthenticated: () => void): LacAuth {
  let authToken: string | null = null;

  function clearStoredToken() {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_STORAGE_KEY);
  }

  function checkAuth(): boolean {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const expiry = sessionStorage.getItem(TOKEN_EXPIRY_STORAGE_KEY);

    if (token && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        authToken = token;
        return true;
      }
      clearStoredToken();
    }

    return false;
  }

  function showPasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) {
      modal.classList.remove('hidden');
      const passwordInput = document.getElementById('password-input') as HTMLInputElement;
      if (passwordInput) {
        passwordInput.focus();
      }
    }
  }

  function hidePasswordModal() {
    const modal = document.getElementById('password-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    const errorEl = document.getElementById('password-error');
    if (errorEl) {
      errorEl.classList.add('hidden');
    }
  }

  function showPasswordError(message: string) {
    const errorEl = document.getElementById('password-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
  }

  async function handlePasswordSubmit() {
    const passwordInput = document.getElementById('password-input') as HTMLInputElement;
    const password = passwordInput.value.trim();

    if (!password) {
      showPasswordError('Please enter a password');
      return;
    }

    const submitBtn = document.getElementById('password-submit') as HTMLButtonElement;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';

    try {
      const response = await fetch(AUTH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          showPasswordError('Incorrect password');
        } else {
          showPasswordError('Authentication failed. Please try again.');
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Unlock';
        return;
      }

      const data = await response.json();
      authToken = data.token;

      sessionStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      const expiryTime = Date.now() + (data.expiresIn * 1000);
      sessionStorage.setItem(TOKEN_EXPIRY_STORAGE_KEY, expiryTime.toString());

      hidePasswordModal();
      onAuthenticated();
    } catch (error) {
      console.error('Authentication error:', error);
      showPasswordError('Network error. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Unlock';
    }
  }

  function handleUnauthorized() {
    authToken = null;
    clearStoredToken();
    showPasswordModal();
  }

  function initialize() {
    const passwordInput = document.getElementById('password-input') as HTMLInputElement;
    const passwordSubmit = document.getElementById('password-submit') as HTMLButtonElement;

    passwordSubmit.addEventListener('click', handlePasswordSubmit);
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handlePasswordSubmit();
      }
    });

    if (checkAuth()) {
      onAuthenticated();
    } else {
      showPasswordModal();
    }
  }

  return {
    initialize,
    getAuthToken: () => authToken,
    handleUnauthorized,
  };
}