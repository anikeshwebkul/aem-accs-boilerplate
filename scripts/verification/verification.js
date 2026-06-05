/* scripts/verification/verification.js */
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { getCookie } from '@dropins/tools/lib.js';

let cachedSettings = null;
let cachedStatus = null;
const flaggedCache = new Map();

function endpoint() {
  const base = getConfigValue('verification-endpoint');
  if (!base) throw new Error('verification-endpoint config is not set');
  return base;
}

export function getCustomerToken() {
  return getCookie('auth_dropin_user_token') || null;
}

async function postJson(path, body) {
  const base = endpoint();
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export async function fetchPublicSettings() {
  if (cachedSettings !== null) return cachedSettings;
  cachedSettings = await postJson('cv-settings-public', {});
  return cachedSettings;
}

export async function fetchStatus() {
  const token = getCustomerToken();
  if (!token) return { status: 'UNVERIFIED' };
  if (cachedStatus !== null) return cachedStatus;
  cachedStatus = await postJson('cv-status-get', { token });
  return cachedStatus;
}

/**
 * Combined context for blocks. Fails open: on any error returns a non-gating ctx.
 */
export async function getVerificationContext() {
  try {
    const loggedIn = !!getCustomerToken();
    const [settings, statusResp] = await Promise.all([fetchPublicSettings(), fetchStatus()]);
    return {
      settings, status: statusResp.status, reason: statusResp.reason, loggedIn,
    };
  } catch (e) {
    console.warn('[verification] context unavailable, failing open', e);
    return { settings: null, status: undefined, loggedIn: false };
  }
}

export async function requestOtp() {
  const token = getCustomerToken();
  if (!token) throw new Error('not signed in');
  return postJson('cv-otp-request', { token });
}

export async function verifyOtp(code) {
  const token = getCustomerToken();
  if (!token) throw new Error('not signed in');
  try {
    return await postJson('cv-otp-verify', { token, code });
  } finally {
    cachedStatus = null;
  }
}

export function verificationHubPath() {
  return getConfigValue('verification-hub-path') || '/customer/account';
}

// --- Guest email verification (no account / token) ---------------------------

/** Request an OTP code for a guest email. */
export async function requestGuestOtp(email) {
  return postJson('cv-otp-request', { email });
}

/** Verify a guest's OTP code. */
export async function verifyGuestOtp(email, code) {
  return postJson('cv-otp-verify', { email, code });
}

/** Whether a guest email is already verified (e.g. after reload). */
export async function fetchGuestVerified(email) {
  if (!email) return { verified: false };
  try {
    return await postJson('cv-guest-verified', { email });
  } catch (e) {
    return { verified: false };
  }
}

export async function fetchProductFlagged(skus) {
  const list = Array.isArray(skus) ? skus : [skus];
  const key = list.slice().sort().join(',');
  if (flaggedCache.has(key)) return flaggedCache.get(key);
  const out = await postJson('cv-product-flagged', { skus: list });
  flaggedCache.set(key, out);
  return out;
}

const cartGateCache = new Map();

/**
 * Ask the server whether a cart (by SKUs) requires verification under the
 * product rules. The server resolves type + category IDs from Commerce, so
 * category exemptions — which the storefront cart/PDP models cannot evaluate
 * (they expose category names, not IDs) — are honoured.
 * @returns {Promise<{requiresVerification:boolean}>}
 */
export async function fetchCartGate(skus) {
  const list = Array.isArray(skus) ? skus : [skus];
  const key = list.slice().sort().join(',');
  if (cartGateCache.has(key)) return cartGateCache.get(key);
  const out = await postJson('cv-cart-gate', { skus: list });
  cartGateCache.set(key, out);
  return out;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadDocument(file) {
  const token = getCustomerToken();
  if (!token) throw new Error('not signed in');
  const dataBase64 = await fileToBase64(file);
  cachedStatus = null;
  return postJson('cv-document-upload', {
    token, fileName: file.name, mime: file.type, dataBase64,
  });
}

/**
 * Upload an already-base64-encoded document ({ fileName, mime, dataBase64 }).
 * Used to finish a registration upload on the account page (avoids the
 * post-signup redirect cancelling an in-flight upload).
 */
export async function uploadPendingDocument({ fileName, mime, dataBase64 }) {
  const token = getCustomerToken();
  if (!token) throw new Error('not signed in');
  cachedStatus = null;
  return postJson('cv-document-upload', {
    token, fileName, mime, dataBase64,
  });
}
