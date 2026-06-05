# Phase R3 — Storefront document-upload surfaces

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Branch `feature/storefront-verification-p1` (no branch ops). Storefront repo (`anikesh-storefront`) — ESM `.js`, semicolons, Airbnb eslint, `node --test` for pure helpers. Backend already deployed (cv-document-upload, cv-status-get, cv-settings-public live).

**Goal:** A logged-in customer can upload an identity document and see their verification status + admin-configured messages, from: (1) the account verification hub, (2) the registration/create-account page, (3) the checkout page. The upload widget is reusable and driven by the public settings (accepted types, max size, messages).

**Architecture:** New `scripts/verification/upload-widget.js` renders the widget given a container; it reads `getVerificationContext()` (settings+status) and calls a new `uploadDocument(file)` in `verification.js` (POST `cv-document-upload` with base64). The v1 `commerce-verification` hub block's OTP form is replaced by this widget. The widget is also appended to the create-account and checkout blocks.

---

## R3-T1: uploadDocument client + reusable upload widget

**Files:** modify `scripts/verification/verification.js`; create `scripts/verification/upload-widget.js`; create `scripts/verification/client-validate.js` + `test/verification/client-validate.test.mjs`.

- [ ] **`client-validate.js`** (pure, testable): `validateClient(file, fileUpload)` where file = `{ name, size }` → `{ ok, reason }`. Mirror backend: extension in `fileUpload.allowedFileTypes`, `size <= maxFileSizeMb*1024*1024`. Reasons `'type'`/`'size'`. Test with `node --test` (5 cases like the backend validator).
- [ ] **`verification.js`** — add:
```js
export async function uploadDocument(file) {
  const token = getCustomerToken();
  if (!token) throw new Error('not signed in');
  const dataBase64 = await fileToBase64(file); // strip the data: prefix
  cachedStatus = null;
  return postJson('cv-document-upload', { token, fileName: file.name, mime: file.type, dataBase64 });
}
```
  plus a `fileToBase64(file)` helper using `FileReader` (resolve with the base64 part after the comma).
- [ ] **`upload-widget.js`** — `export async function renderUploadWidget(container, opts = {})`:
  - `const ctx = await getVerificationContext()`. If `!ctx.settings || !ctx.settings.enabled` → render nothing (or a neutral note) and return.
  - Render a status badge (UNVERIFIED/PENDING/APPROVED/REJECTED) + the relevant message from `ctx.settings.messages` (documentDescription always; pendingMessage when PENDING; rejected reason + (if allowed) re-upload when REJECTED).
  - A `<input type="file">` with `accept` derived from `ctx.settings.fileUpload.allowedFileTypes` (map to extensions/MIME), and a Submit button. On submit: run `validateClient({name,size}, ctx.settings.fileUpload)`; if not ok show a message; else `await uploadDocument(file)`, show result (PENDING on success), call `opts.onUploaded?.()`, and re-render.
  - Hide the upload input when status is APPROVED (show "Verified") or when PENDING and re-upload not applicable; show it for NOT_SUBMITTED/UNVERIFIED and for REJECTED when `allowReupload` (the backend enforces; widget just reflects).
  - Fail-open: wrap in try/catch; on error render a small notice, never throw.
  - Reuse the existing `.cv-*` styles where sensible; add minimal new classes.
- [ ] `npm run test:unit` (client-validate passes); `npm run lint:js` clean; `node --check` both new files. Commit `feat(verification): storefront upload widget + client`.

---

## R3-T2: use the widget on hub + registration + checkout

**Files:** modify `blocks/commerce-verification/commerce-verification.js` (hub — replace OTP form); modify `blocks/commerce-create-account/commerce-create-account.js` (registration); modify `blocks/commerce-checkout/commerce-checkout.js` (checkout). READ each block first.

- [ ] **Hub** (`commerce-verification`): remove the OTP form usage; in `decorate`, after the sign-in check, create a container and call `renderUploadWidget(container)`. Keep the "please sign in" path. (This is the account-details surface.)
- [ ] **Registration** (`commerce-create-account`): READ the block. After the create-account form renders, append a container and call `renderUploadWidget(container)`. It will show "please sign in / upload" appropriately; once the new customer is authenticated the widget activates. Do not break the existing sign-up flow (purely additive).
- [ ] **Checkout** (`commerce-checkout`): the R2/P2 work already added a verification notice + cart-gate hook. Add a container near the top and call `renderUploadWidget(container)` so the customer can upload without leaving checkout. Additive; do not disturb the existing `runCheckoutGate` logic.
- [ ] `npm run lint:js` clean; `node --check` each edited block. Commit `feat(verification): document upload on hub, registration, checkout`.

---

## R3-T3: browser validation

- [ ] With the storefront running on localhost:3001 (already up), reload the PDP/account; in the browser console dynamically import `upload-widget.js` and `verification.js`, render the widget into a test container (like the v1 hub validation), confirm: unauthenticated → shows sign-in prompt; the widget reads the deployed v2 settings (accepted types/messages); no console errors; `cv-settings-public` drives the accept list.
- [ ] (user-assisted) Full upload as a logged-in customer → PENDING; admin Review Queue shows it.
- [ ] Commit any fixes. R3 complete.

---

## Self-review notes
- Reuses getVerificationContext/getCustomerToken; new uploadDocument client + pure client-validate (tested) + DOM widget (browser, validated in-browser). Widget driven entirely by deployed v2 public settings.
- Order-placement BLOCK is R4 (this phase only enables uploading + status display on the 3 surfaces).
- Risk: create-account/checkout block internals — implementer must read and append additively without breaking existing flows.
