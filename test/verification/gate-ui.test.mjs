/* test/verification/gate-ui.test.mjs */
// gate-ui.js exports async functions that depend on browser globals (document,
// dynamic import of verification.js which calls browser APIs). Unit coverage
// for the gate decision logic lives in gating.test.mjs; this file is a
// placeholder to keep the test runner happy and document the expected
// integration contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('gate-ui exports applyPdpGate and applyCheckoutGate', async () => {
  // Verify the module exposes the expected named exports without executing
  // any browser-dependent code. We import the module text as a URL to avoid
  // triggering the lazy dynamic imports inside the functions.
  const src = await import('node:fs/promises')
    .then((fs) => fs.readFile(
      new URL('../../scripts/verification/gate-ui.js', import.meta.url),
      'utf8',
    ));
  assert.ok(src.includes('export async function applyPdpGate'), 'applyPdpGate exported');
  assert.ok(src.includes('export async function applyCheckoutGate'), 'applyCheckoutGate exported');
  assert.ok(!src.includes('decideGate'), 'legacy decideGate removed');
  assert.ok(!src.includes('fetchProductFlagged'), 'legacy fetchProductFlagged removed');
  assert.ok(!src.includes("settings.scope"), 'legacy scope field removed');
});
