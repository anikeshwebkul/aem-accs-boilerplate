import { SignUp } from '@dropins/storefront-auth/containers/SignUp.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import { events } from '@dropins/tools/event-bus.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  authPrivacyPolicyConsentSlot,
  rootLink,
} from '../../scripts/commerce.js';
import { renderRegistrationUpload } from '../../scripts/verification/upload-widget.js';

// Initialize
import '../../scripts/initializers/auth.js';

export default async function decorate(block) {
  if (checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
    return;
  }

  // Holds the verification controller created inside the slot below.
  let reg = {
    required: false, requiredMessage: '', getFile: () => null, showError: () => {},
  };

  // Render the verification document picker INSIDE the form, just ABOVE the
  // privacy-policy consent, so it reads as a required part of sign-up. We do
  // this via the PrivacyPolicyConsent slot (verification first, then consent),
  // which keeps it inside the dropin-managed form and survives re-renders.
  const slots = {
    PrivacyPolicyConsent: async (ctx) => {
      try {
        const vc = document.createElement('div');
        vc.className = 'cv-registration-verification';
        ctx.appendChild(vc);
        reg = await renderRegistrationUpload(vc);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[verification] registration widget skipped', e);
      }
      // Original privacy-policy consent, rendered after the verification section.
      await authPrivacyPolicyConsentSlot.PrivacyPolicyConsent(ctx);
    },
  };

  await authRenderer.render(SignUp, {
    hideCloseBtnOnEmailConfirmation: true,
    routeSignIn: () => rootLink(CUSTOMER_LOGIN_PATH),
    routeRedirectOnSignIn: () => rootLink(CUSTOMER_ACCOUNT_PATH),
    slots,
  })(block);

  // Enforce a mandatory document (when documentOptional = false): block the
  // "Create account" submit until a valid file is attached. Always attach the
  // listener and check reg at click time (the slot resolves asynchronously).
  block.addEventListener('click', (e) => {
    if (!reg.required || reg.getFile()) return;
    const btn = e.target.closest && e.target.closest('button[type="submit"]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    reg.showError(reg.requiredMessage);
    const vc = block.querySelector('.cv-registration-verification');
    if (vc) vc.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, true);

  // Account just created. The dropin redirects to My Account immediately, which
  // would cancel an in-flight upload here — so persist the (already-encoded)
  // document synchronously and finish the upload on the My Account page.
  events.on('authenticated', (isAuthenticated) => {
    if (!isAuthenticated) return;
    const pending = reg.getPending && reg.getPending();
    if (!pending) return;
    try {
      window.sessionStorage.setItem('cv_pending_doc', JSON.stringify(pending));
    } catch (e) { /* ignore */ }
  });
}
