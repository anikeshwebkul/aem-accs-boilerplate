/* scripts/verification/gating.js */

/**
 * Pure v2 gate decision. Fail-open (false) on missing inputs.
 *
 * @param {'addToCart'|'checkout'} action  (kept for API compatibility / logging)
 * @param {{settings?:object, status?:string}} ctx
 * @param {{items?:Array<{sku:string, type?:string|null,
 *   categoryIds?:Array<string|number>}>}} data  cart/product items
 * @returns {boolean}
 */
export function isGated(action, ctx, data = {}) {
  const settings = ctx && ctx.settings;
  if (!settings || !settings.enabled) return false; // feature off
  if (ctx.status === undefined || ctx.status === null) return false; // error → fail-open
  if (ctx.status === 'APPROVED') return false; // verified
  const items = Array.isArray(data.items) ? data.items : [];
  // cart not in scope of the product rules
  if (!cartRequiresVerification(items, settings.productRules || {})) return false;
  // A logged-in customer with no verification record (UNVERIFIED) is an
  // "existing" customer who pre-dates the feature: only gate them when the
  // merchant requires existing customers to verify. Customers with a record
  // (PENDING / REJECTED / NOT_SUBMITTED) are always gated until APPROVED.
  if (ctx.loggedIn && ctx.status === 'UNVERIFIED' && !settings.existingCustomersRequired) {
    return false;
  }
  // Guests verify by EMAIL at checkout (when guest email verification is on), so
  // don't block them earlier (add-to-cart) — otherwise they could never reach
  // checkout to verify. The checkout gate still requires the email OTP.
  if (!ctx.loggedIn && action === 'addToCart' && settings.guestEmailVerification) {
    return false;
  }
  return true;
}

function isExempt(item, rules) {
  if ((rules.exemptedProductSkus || []).includes(item.sku)) return true;
  if (item.type && (rules.exemptedProductTypes || []).includes(item.type)) return true;
  const cats = Array.isArray(item.categoryIds) ? item.categoryIds : [];
  return cats.some((c) => (rules.exemptedCategoryIds || []).includes(String(c)));
}

/**
 * Determines whether a cart/product list requires verification
 * under the v2 exemption model.
 *
 * @param {Array<{sku:string, type?:string|null,
 *   categoryIds?:Array<string|number>}>} items
 * @param {{enabled?:boolean, exemptedProductSkus?:string[],
 *   exemptedProductTypes?:string[], exemptedCategoryIds?:string[]}} rules
 * @returns {boolean}
 */
export function cartRequiresVerification(items, rules) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return false;
  if (!rules || !rules.enabled) return true;
  return list.some((it) => !isExempt(it, rules));
}

/**
 * Whether the customer may (re)upload a document for the given status.
 * Re-upload after a rejection is governed by the admin `allowReupload` setting;
 * a first upload (any non-rejected status) is always allowed.
 *
 * @param {string} status
 * @param {{allowReupload?:boolean}} [settings]
 * @returns {boolean}
 */
export function canReupload(status, settings = {}) {
  if (status !== 'REJECTED') return true;
  return settings.allowReupload !== false;
}

/**
 * Whether the gate decision needs a server round-trip to be accurate. The
 * storefront cart/PDP models expose category names, not IDs, so category
 * exemptions can only be evaluated server-side (where Commerce metadata is
 * available). Everything else (off, SKU/type exemptions) is decided client-side.
 *
 * @param {{productRules?:{enabled?:boolean, exemptedCategoryIds?:string[]}}} settings
 * @returns {boolean}
 */
export function needsServerEval(settings) {
  const rules = settings && settings.productRules;
  return !!(rules && rules.enabled && (rules.exemptedCategoryIds || []).length > 0);
}
