/* scripts/verification/gate-ui.js */
import { isGated, needsServerEval } from './gating.js';

/**
 * Refine a client-side gate decision with a server round-trip when category
 * exemptions are configured (the storefront cannot see category IDs). Only
 * called when the client already decided "gated", so enabled + not-approved
 * already hold and the server's requiresVerification is authoritative.
 * On server error we keep the (stricter) client decision — never less safe.
 *
 * @param {boolean} clientGated
 * @param {object} settings
 * @param {string[]} skus
 * @param {function} fetchCartGate
 * @returns {Promise<boolean>}
 */
async function refineGate(clientGated, settings, skus, fetchCartGate) {
  if (!clientGated || !needsServerEval(settings)) return clientGated;
  try {
    const { requiresVerification } = await fetchCartGate(skus);
    return !!requiresVerification;
  } catch (e) {
    console.warn('[verification] server cart-gate failed; keeping client decision', e);
    return clientGated;
  }
}

/**
 * Build a DOM notice element with a link to the verification hub.
 * @param {string} message
 * @param {string} hubPath
 * @returns {HTMLElement}
 */
const SHIELD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z"/><path d="M12 8v4"/><path d="M12 15h.01"/></svg>';

function gateNotice(message, hubPath) {
  const wrap = document.createElement('div');
  wrap.className = 'cv-gate-notice';
  const ic = document.createElement('span');
  ic.className = 'cv-ico';
  ic.innerHTML = SHIELD_SVG;
  const text = document.createElement('span');
  text.textContent = message;
  const link = document.createElement('a');
  link.className = 'cv-gate-link';
  link.href = hubPath;
  link.textContent = 'Verify your account';
  wrap.append(ic, text, ' ', link);
  return wrap;
}

/**
 * Gate the PDP Add-to-Cart. Fails open (does nothing) on error.
 *
 * @param {{
 *   sku: string,
 *   item?: {sku:string, type?:string|null, categoryIds?:Array<string|number>},
 *   addToCart: object,
 *   alertEl: HTMLElement
 * }} args
 *   item is optional; if omitted a minimal `{ sku, type: null, categoryIds: [] }` is used.
 *   addToCart is the dropin Button instance (has setProps); alertEl is a container.
 */
export async function applyPdpGate({
  sku, item, addToCart, alertEl,
}) {
  try {
    const { getVerificationContext, verificationHubPath, fetchCartGate } = await import('./verification.js');
    const ctx = await getVerificationContext();
    const resolvedItem = item || { sku, type: null, categoryIds: [] };
    const clientGated = isGated('addToCart', ctx, { items: [resolvedItem] });
    const gated = await refineGate(clientGated, ctx.settings, [resolvedItem.sku], fetchCartGate);
    if (!gated) return;
    if (addToCart && addToCart.setProps) {
      addToCart.setProps((prev) => ({ ...prev, disabled: true }));
    }
    if (alertEl) {
      alertEl.replaceChildren(
        gateNotice(
          'This item requires a verified account to purchase.',
          verificationHubPath(),
        ),
      );
    }
  } catch (e) {
    console.warn('[verification] pdp gate skipped', e);
  }
}

/**
 * Gate checkout. Returns true if gated (caller blocks progression).
 *
 * @param {{
 *   items?: Array<{sku:string, type?:string|null, categoryIds?:Array<string|number>}>,
 *   skus?: string[],
 *   noticeEl: HTMLElement
 * }} args
 *   Prefer `items` (full item objects). `skus` is accepted for backwards compatibility
 *   and is coerced to `[{ sku, type: null, categoryIds: [] }]`.
 */
export async function applyCheckoutGate({ items, skus, noticeEl }) {
  try {
    const { getVerificationContext, verificationHubPath, fetchCartGate } = await import('./verification.js');
    const ctx = await getVerificationContext();

    // Build item list: prefer rich `items`, fall back to legacy `skus` array.
    let cartItems;
    if (Array.isArray(items)) {
      cartItems = items;
    } else {
      cartItems = (Array.isArray(skus) ? skus : []).map(
        (s) => ({ sku: s, type: null, categoryIds: [] }),
      );
    }

    const clientGated = isGated('checkout', ctx, { items: cartItems });
    const cartSkus = cartItems.map((i) => i.sku);
    const gated = await refineGate(clientGated, ctx.settings, cartSkus, fetchCartGate);
    if (gated && noticeEl) {
      noticeEl.replaceChildren(
        gateNotice(
          'Your account must be verified before checking out.',
          verificationHubPath(),
        ),
      );
    }
    return gated;
  } catch (e) {
    console.warn('[verification] checkout gate skipped', e);
    return false;
  }
}
