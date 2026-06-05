/* test/verification/client-validate.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientValidate } from '../../scripts/verification/client-validate.js';

const fu = { allowedFileTypes: ['jpg', 'pdf'], maxFileSizeMb: 5 };
const MB = 1024 * 1024;

test('allowed type within size returns ok', () => {
  const result = clientValidate({ name: 'photo.jpg', size: 2 * MB }, fu);
  assert.deepEqual(result, { ok: true });
});

test('disallowed extension returns type error', () => {
  const result = clientValidate({ name: 'document.exe', size: 1 * MB }, fu);
  assert.deepEqual(result, { ok: false, reason: 'type' });
});

test('oversize file returns size error', () => {
  const result = clientValidate({ name: 'big.pdf', size: 6 * MB }, fu);
  assert.deepEqual(result, { ok: false, reason: 'size' });
});

test('case-insensitive extension is allowed', () => {
  const result = clientValidate({ name: 'image.JPG', size: 1 * MB }, fu);
  assert.deepEqual(result, { ok: true });
});

test('no extension returns type error', () => {
  const result = clientValidate({ name: 'noextension', size: 1 * MB }, fu);
  assert.deepEqual(result, { ok: false, reason: 'type' });
});
