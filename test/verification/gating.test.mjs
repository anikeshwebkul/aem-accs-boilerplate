/* test/verification/gating.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isGated, cartRequiresVerification, canReupload, needsServerEval,
} from '../../scripts/verification/gating.js';

// v2 settings shape
const settingsEnabled = {
  enabled: true,
  productRules: { enabled: false },
};

const settingsWithRules = {
  enabled: true,
  productRules: {
    enabled: true,
    exemptedProductSkus: ['SKU-EXEMPT'],
    exemptedProductTypes: ['virtual'],
    exemptedCategoryIds: ['42'],
  },
};

const items = [{ sku: 'SKU-A', type: null, categoryIds: [] }];

// --- isGated ---

test('feature disabled → not gated', () => {
  const ctx = { settings: { enabled: false }, status: 'UNVERIFIED' };
  assert.equal(isGated('addToCart', ctx, { items }), false);
});

test('APPROVED status → not gated', () => {
  const ctx = { settings: settingsEnabled, status: 'APPROVED' };
  assert.equal(isGated('addToCart', ctx, { items }), false);
});

test('null status → fail-open (not gated)', () => {
  const ctx = { settings: settingsEnabled, status: null };
  assert.equal(isGated('addToCart', ctx, { items }), false);
});

test('undefined status → fail-open (not gated)', () => {
  const ctx = { settings: settingsEnabled, status: undefined };
  assert.equal(isGated('addToCart', ctx, { items }), false);
});

test('enabled + productRules.enabled=false + items + UNVERIFIED → gated', () => {
  const ctx = { settings: settingsEnabled, status: 'UNVERIFIED' };
  assert.equal(isGated('addToCart', ctx, { items }), true);
});

test('enabled + productRules.enabled=false + items + PENDING → gated', () => {
  const ctx = { settings: settingsEnabled, status: 'PENDING' };
  assert.equal(isGated('checkout', ctx, { items }), true);
});

test('enabled + productRules.enabled=false + NO items → not gated', () => {
  const ctx = { settings: settingsEnabled, status: 'UNVERIFIED' };
  assert.equal(isGated('addToCart', ctx, { items: [] }), false);
});

// --- existingCustomersRequired (logged-in vs guest) ---

test('logged-in UNVERIFIED (no record) + existingCustomersRequired=false → grandfathered, not gated', () => {
  const ctx = {
    settings: { enabled: true, productRules: { enabled: false }, existingCustomersRequired: false },
    status: 'UNVERIFIED',
    loggedIn: true,
  };
  assert.equal(isGated('checkout', ctx, { items }), false);
});

test('logged-in UNVERIFIED (no record) + existingCustomersRequired=true → gated', () => {
  const ctx = {
    settings: { enabled: true, productRules: { enabled: false }, existingCustomersRequired: true },
    status: 'UNVERIFIED',
    loggedIn: true,
  };
  assert.equal(isGated('checkout', ctx, { items }), true);
});

test('logged-in PENDING is always gated regardless of existingCustomersRequired', () => {
  const ctx = {
    settings: { enabled: true, productRules: { enabled: false }, existingCustomersRequired: false },
    status: 'PENDING',
    loggedIn: true,
  };
  assert.equal(isGated('checkout', ctx, { items }), true);
});

test('guest UNVERIFIED is still gated (document gate); existingCustomersRequired only applies to logged-in', () => {
  const ctx = {
    settings: { enabled: true, productRules: { enabled: false }, existingCustomersRequired: false },
    status: 'UNVERIFIED',
    loggedIn: false,
  };
  assert.equal(isGated('checkout', ctx, { items }), true);
});

// --- guest email verification: don't block add-to-cart, gate at checkout ---

test('guest + guestEmailVerification: add-to-cart NOT blocked (verify by email at checkout)', () => {
  const ctx = {
    settings: { enabled: true, productRules: { enabled: false }, guestEmailVerification: true },
    status: 'UNVERIFIED',
    loggedIn: false,
  };
  assert.equal(isGated('addToCart', ctx, { items }), false);
});

test('guest + guestEmailVerification: checkout IS gated (triggers email OTP)', () => {
  const ctx = {
    settings: { enabled: true, productRules: { enabled: false }, guestEmailVerification: true },
    status: 'UNVERIFIED',
    loggedIn: false,
  };
  assert.equal(isGated('checkout', ctx, { items }), true);
});

test('guest WITHOUT guest email verification: add-to-cart blocked (must create account)', () => {
  const ctx = {
    settings: { enabled: true, productRules: { enabled: false }, guestEmailVerification: false },
    status: 'UNVERIFIED',
    loggedIn: false,
  };
  assert.equal(isGated('addToCart', ctx, { items }), true);
});

test('enabled + rules on + all items exempt by sku → not gated', () => {
  const ctx = { settings: settingsWithRules, status: 'UNVERIFIED' };
  const exemptItems = [{ sku: 'SKU-EXEMPT', type: null, categoryIds: [] }];
  assert.equal(isGated('addToCart', ctx, { items: exemptItems }), false);
});

test('enabled + rules on + one non-exempt item → gated', () => {
  const ctx = { settings: settingsWithRules, status: 'PENDING' };
  const mixedItems = [
    { sku: 'SKU-EXEMPT', type: null, categoryIds: [] },
    { sku: 'SKU-NON-EXEMPT', type: null, categoryIds: [] },
  ];
  assert.equal(isGated('checkout', ctx, { items: mixedItems }), true);
});

test('missing settings → fail-open (not gated)', () => {
  assert.equal(isGated('addToCart', {}, { items }), false);
  assert.equal(isGated('addToCart', null, { items }), false);
});

// --- cartRequiresVerification ---

test('cartRequiresVerification: empty items → false', () => {
  assert.equal(cartRequiresVerification([], { enabled: false }), false);
});

test('cartRequiresVerification: rules disabled + items → true', () => {
  assert.equal(cartRequiresVerification(items, { enabled: false }), true);
});

test('cartRequiresVerification: rules enabled + exempt by type → false', () => {
  const rules = { enabled: true, exemptedProductTypes: ['virtual'], exemptedProductSkus: [], exemptedCategoryIds: [] };
  assert.equal(cartRequiresVerification([{ sku: 'X', type: 'virtual', categoryIds: [] }], rules), false);
});

test('cartRequiresVerification: rules enabled + exempt by categoryId → false', () => {
  const rules = { enabled: true, exemptedCategoryIds: ['42'], exemptedProductSkus: [], exemptedProductTypes: [] };
  assert.equal(cartRequiresVerification([{ sku: 'X', type: null, categoryIds: [42] }], rules), false);
});

// --- canReupload ---

test('canReupload: non-rejected statuses always allow upload', () => {
  assert.equal(canReupload('NOT_SUBMITTED', { allowReupload: false }), true);
  assert.equal(canReupload('UNVERIFIED', { allowReupload: false }), true);
  assert.equal(canReupload('PENDING', {}), true);
});

test('canReupload: REJECTED honors allowReupload', () => {
  assert.equal(canReupload('REJECTED', { allowReupload: true }), true);
  assert.equal(canReupload('REJECTED', { allowReupload: false }), false);
  assert.equal(canReupload('REJECTED', {}), true); // default (undefined) => allowed
});

// --- needsServerEval ---

test('needsServerEval: only when rules enabled AND category exemptions configured', () => {
  assert.equal(needsServerEval({ productRules: { enabled: true, exemptedCategoryIds: ['5'] } }), true);
  assert.equal(needsServerEval({ productRules: { enabled: true, exemptedCategoryIds: [] } }), false);
  assert.equal(needsServerEval({ productRules: { enabled: false, exemptedCategoryIds: ['5'] } }), false);
  assert.equal(needsServerEval({ productRules: { enabled: true } }), false);
  assert.equal(needsServerEval({}), false);
  assert.equal(needsServerEval(null), false);
});
