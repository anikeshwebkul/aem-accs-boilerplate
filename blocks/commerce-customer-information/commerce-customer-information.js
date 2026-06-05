import CustomerInformation from '@dropins/storefront-account/containers/CustomerInformation.js';
import { render as accountRenderer } from '@dropins/storefront-account/render.js';
import {
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';
import { renderUploadWidget } from '../../scripts/verification/upload-widget.js';
import { uploadPendingDocument } from '../../scripts/verification/verification.js';

// Initialize
import '../../scripts/initializers/account.js';

export default async function decorate(block) {
  if (!checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
    return;
  }

  await accountRenderer.render(CustomerInformation, {})(block);

  // Customer Verification: account-level upload / status / re-upload-after-rejection.
  // This is the primary place a signed-in customer verifies (and re-uploads if
  // rejected), per the verification feature spec. Fails open — never blocks the page.
  try {
    // Finish a document handed off from registration (the signup redirect would
    // otherwise have cancelled the in-flight upload).
    let pendingRaw = null;
    try { pendingRaw = window.sessionStorage.getItem('cv_pending_doc'); } catch (e) { /* ignore */ }
    if (pendingRaw) {
      try { window.sessionStorage.removeItem('cv_pending_doc'); } catch (e) { /* ignore */ }
      try {
        await uploadPendingDocument(JSON.parse(pendingRaw));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[verification] pending document upload failed', e);
      }
    }

    const verificationContainer = document.createElement('div');
    verificationContainer.className = 'cv-account-verification';
    block.append(verificationContainer);
    await renderUploadWidget(verificationContainer);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[verification] account widget skipped', e);
  }
}
