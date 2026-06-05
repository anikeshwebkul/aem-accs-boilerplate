/* eslint-disable import/no-unresolved */
/* eslint-disable no-unused-vars */

// Dropin Tools
import { events } from '@dropins/tools/event-bus.js';
import { initReCaptcha } from '@dropins/tools/recaptcha.js';

// Order Dropin Modules
import * as orderApi from '@dropins/storefront-order/api.js';

// Checkout Dropin Libraries
import {
  createScopedSelector,
  isVirtualCart,
  setMetaTags,
  validateForms,
} from '@dropins/storefront-checkout/lib/utils.js';

// Payment Services Dropin
import { PaymentMethodCode } from '@dropins/storefront-payment-services/api.js';

// Block Utilities
import {
  buildOrderDetailsUrl,
  displayOverlaySpinner,
  removeOverlaySpinner,
} from './utils.js';

// Fragment functions
import {
  createCheckoutFragment,
  selectors,
} from './fragments.js';

// Container functions
import {
  renderAddressForm,
  renderBillingAddressFormSkeleton,
  renderBillToShippingAddress,
  renderCartSummaryList,
  renderCheckoutHeader,
  renderCustomerBillingAddresses,
  renderCustomerShippingAddresses,
  renderGiftOptions,
  renderLoginForm,
  renderMergedCartBanner,
  renderOrderSummary,
  renderOutOfStock,
  renderPaymentMethods,
  renderPlaceOrder,
  renderServerError,
  renderShippingAddressFormSkeleton,
  renderShippingMethods,
  renderTermsAndConditions,
} from './containers.js';

// Constants
import {
  BILLING_ADDRESS_DATA_KEY,
  BILLING_FORM_NAME,
  LOGIN_FORM_NAME,
  PURCHASE_ORDER_FORM_NAME,
  SHIPPING_ADDRESS_DATA_KEY,
  SHIPPING_FORM_NAME,
  TERMS_AND_CONDITIONS_FORM_NAME,
} from './constants.js';

import { rootLink } from '../../scripts/commerce.js';
import { applyCheckoutGate } from '../../scripts/verification/gate-ui.js';
import { renderUploadWidget } from '../../scripts/verification/upload-widget.js';
import { renderGuestVerification } from '../../scripts/verification/guest-otp.js';
import { getVerificationContext } from '../../scripts/verification/verification.js';

// Initializers
import '../../scripts/initializers/account.js';
import '../../scripts/initializers/checkout.js';
import '../../scripts/initializers/order.js';
import '../../scripts/initializers/payment-services.js';

// Checkout success block import and CSS preload
import { renderCheckoutSuccess, preloadCheckoutSuccess } from '../commerce-checkout-success/commerce-checkout-success.js';

preloadCheckoutSuccess();

function redirectToCartIfEmpty(cartData) {
  const isOrderPlaced = events.lastPayload('order/placed') !== undefined;

  if (!isOrderPlaced && (cartData === null || cartData?.items?.length === 0)) {
    window.location.href = rootLink('/cart');
  }
}

export default async function decorate(block) {
  setMetaTags('Checkout');
  document.title = 'Checkout';

  const cartData = events.lastPayload('cart/initialized');
  redirectToCartIfEmpty(cartData);

  // Container and component references
  let shippingForm;
  let billingForm;
  let shippingAddresses;
  let billingAddresses;

  const shippingFormRef = { current: null };
  const billingFormRef = { current: null };
  const creditCardFormRef = { current: null };
  const loaderRef = { current: null };

  events.on('order/placed', () => {
    setMetaTags('Order Confirmation');
    document.title = 'Order Confirmation';
  });

  // Create the checkout layout using fragments
  const checkoutFragment = createCheckoutFragment();

  // Create scoped selector for the checkout fragment
  const getElement = createScopedSelector(checkoutFragment);

  // Get all checkout elements using centralized selectors
  const $content = getElement(selectors.checkout.content);
  const $loader = getElement(selectors.checkout.loader);
  const $mergedCartBanner = getElement(selectors.checkout.mergedCartBanner);
  const $heading = getElement(selectors.checkout.heading);
  const $serverError = getElement(selectors.checkout.serverError);
  const $outOfStock = getElement(selectors.checkout.outOfStock);
  const $login = getElement(selectors.checkout.login);
  const $shippingForm = getElement(selectors.checkout.shippingForm);
  const $billToShipping = getElement(selectors.checkout.billToShipping);
  const $delivery = getElement(selectors.checkout.delivery);
  const $paymentMethods = getElement(selectors.checkout.paymentMethods);
  const $billingForm = getElement(selectors.checkout.billingForm);
  const $orderSummary = getElement(selectors.checkout.orderSummary);
  const $cartSummary = getElement(selectors.checkout.cartSummary);
  const $placeOrder = getElement(selectors.checkout.placeOrder);
  const $giftOptions = getElement(selectors.checkout.giftOptions);
  const $termsAndConditions = getElement(selectors.checkout.termsAndConditions);

  block.appendChild(checkoutFragment);

  const handleValidation = () => validateForms([
    { name: LOGIN_FORM_NAME },
    { name: SHIPPING_FORM_NAME, ref: shippingFormRef },
    { name: BILLING_FORM_NAME, ref: billingFormRef },
    { name: PURCHASE_ORDER_FORM_NAME },
    { name: TERMS_AND_CONDITIONS_FORM_NAME },
  ]);

  const handlePlaceOrder = async ({ cartId, code }) => {
    await displayOverlaySpinner(loaderRef, $loader);
    try {
      // Payment Services credit card
      if (code === PaymentMethodCode.CREDIT_CARD) {
        if (!creditCardFormRef.current) {
          console.error('Credit card form not rendered.');
          return;
        }
        if (!creditCardFormRef.current.validate()) {
          // Credit card form invalid; abort order placement
          return;
        }
        // Submit Payment Services credit card form
        await creditCardFormRef.current.submit();
      }
      // Place order
      await orderApi.placeOrder(cartId);
    } catch (error) {
      console.error(error);
      throw error;
    } finally {
      removeOverlaySpinner(loaderRef, $loader);
    }
  };

  // First, render the place order component
  const placeOrderApi = await renderPlaceOrder($placeOrder, { handleValidation, handlePlaceOrder });

  // Ensure a notice element exists near the top of the checkout block
  let noticeEl = block.querySelector('.checkout__verification-notice');
  if (!noticeEl) {
    noticeEl = document.createElement('div');
    noticeEl.className = 'checkout__verification-notice';
    block.prepend(noticeEl);
  }

  // Container for the document-upload ("identity") widget — shown to LOGGED-IN
  // customers only (guests cannot upload to an account; they verify by email).
  const checkoutUploadContainer = document.createElement('div');
  checkoutUploadContainer.className = 'cv-checkout-upload';
  noticeEl.insertAdjacentElement('afterend', checkoutUploadContainer);

  // Container for the guest email-OTP widget (guest checkout only, when guest
  // email verification is enabled and the cart is in scope).
  const guestOtpContainer = document.createElement('div');
  guestOtpContainer.className = 'cv-checkout-guest-otp';
  checkoutUploadContainer.insertAdjacentElement('afterend', guestOtpContainer);
  let guestWidget = null;
  let uploadRendered = false;

  const setPlaceOrderDisabled = (disabled) => {
    if (placeOrderApi && placeOrderApi.setProps) {
      placeOrderApi.setProps((p) => ({ ...p, disabled }));
    }
  };

  /**
   * Run the checkout gate against the current cart's SKUs.
   * - Logged-in customers verify by document (existing flow).
   * - Guests (when guest email verification is enabled) verify by email OTP;
   *   place-order stays disabled until the code is verified.
   * Fails open — errors are caught and never block checkout.
   * @param {import('@dropins/storefront-cart/data/models/cart-model').CartModel|null} cart
   */
  async function runCheckoutGate(cart) {
    try {
      // Build rich item objects so the v2 exemption model can evaluate
      // type and (where available) category exemptions. Cart items expose
      // sku + itemType (__typename); category IDs are resolved server-side.
      const items = (cart?.items || [])
        .filter((i) => i.sku)
        .map((i) => ({ sku: i.sku, type: i.itemType || null, categoryIds: [] }));

      const ctx = await getVerificationContext();
      const enabled = !!(ctx && ctx.settings && ctx.settings.enabled);
      const guestFlow = !!(enabled && !ctx.loggedIn && ctx.settings.guestEmailVerification);

      // Identity (document) widget: logged-in customers only. Render once so they
      // can verify without leaving checkout. Guests never see it.
      if (enabled && ctx.loggedIn) {
        if (!uploadRendered) {
          uploadRendered = true;
          renderUploadWidget(checkoutUploadContainer).catch((e) => {
            console.warn('[verification] checkout upload widget skipped', e);
          });
        }
      } else {
        checkoutUploadContainer.replaceChildren();
      }

      // Base requirement (document/exemption-aware). For a guest this tells us
      // whether the cart needs verification at all.
      const needsVerification = await applyCheckoutGate({ items, noticeEl });

      if (guestFlow && needsVerification) {
        // Replace the generic notice with the guest email-OTP widget.
        noticeEl.replaceChildren();
        if (!guestWidget) {
          guestWidget = renderGuestVerification(guestOtpContainer, {
            email: (cart && cart.email) || '',
            onChange: (verified) => setPlaceOrderDisabled(!verified),
          });
        }
        setPlaceOrderDisabled(!guestWidget.isVerified());
        return;
      }

      // Not a guest flow (or cart out of scope): clear any guest widget.
      if (guestWidget) { guestWidget.destroy(); guestWidget = null; }
      if (!needsVerification) {
        noticeEl.replaceChildren();
      }
      setPlaceOrderDisabled(needsVerification);
    } catch (e) {
      console.warn('[verification] checkout gate runner skipped', e);
    }
  }

  // Run the gate using the already-loaded cart payload (if available)
  runCheckoutGate(events.lastPayload('cart/initialized') || null);

  // Re-run whenever the cart changes
  events.on('cart/data', runCheckoutGate);

  // Render the remaining containers
  const [
    _mergedCartBanner,
    _header,
    _serverError,
    _outOfStock,
    _loginForm,
    shippingFormSkeleton,
    _billToShipping,
    _shippingMethods,
    _paymentMethods,
    billingFormSkeleton,
    _orderSummary,
    _cartSummary,
    _termsAndConditions,
    _giftOptions,
  ] = await Promise.all([
    renderMergedCartBanner($mergedCartBanner),

    renderCheckoutHeader($heading, 'Checkout'),

    renderServerError($serverError, $content),

    renderOutOfStock($outOfStock),

    renderLoginForm($login),

    renderShippingAddressFormSkeleton($shippingForm),

    renderBillToShippingAddress($billToShipping),

    renderShippingMethods($delivery),

    renderPaymentMethods($paymentMethods, creditCardFormRef),

    renderBillingAddressFormSkeleton($billingForm),

    renderOrderSummary($orderSummary),

    renderCartSummaryList($cartSummary),

    renderTermsAndConditions($termsAndConditions),

    renderGiftOptions($giftOptions),
  ]);

  async function initializeCheckout(data) {
    await initReCaptcha(0);
    if (data.isGuest) await displayGuestAddressForms(data);
    else {
      removeOverlaySpinner(loaderRef, $loader);
      await displayCustomerAddressForms(data);
    }
  }

  async function displayGuestAddressForms(data) {
    if (isVirtualCart(data)) {
      shippingForm?.remove();
      shippingForm = null;
      $shippingForm.innerHTML = '';
    } else if (!shippingForm) {
      shippingFormSkeleton.remove();

      shippingForm = await renderAddressForm($shippingForm, shippingFormRef, data, 'shipping');
    }

    if (!billingForm) {
      billingFormSkeleton.remove();

      billingForm = await renderAddressForm($billingForm, billingFormRef, data, 'billing');
    }
  }

  async function displayCustomerAddressForms(data) {
    if (isVirtualCart(data)) {
      shippingAddresses?.remove();
      shippingAddresses = null;
      $shippingForm.innerHTML = '';
    } else if (!shippingAddresses) {
      shippingForm?.remove();
      shippingForm = null;
      shippingFormRef.current = null;

      shippingAddresses = await renderCustomerShippingAddresses(
        $shippingForm,
        shippingFormRef,
        data,
      );
    }

    if (!billingAddresses) {
      billingForm?.remove();
      billingForm = null;
      billingFormRef.current = null;

      billingAddresses = await renderCustomerBillingAddresses(
        $billingForm,
        billingFormRef,
        data,
      );
    }
  }

  async function handleCheckoutUpdated(data) {
    if (!data) return;
    await initializeCheckout(data);
  }

  function handleAuthenticated(authenticated) {
    if (!authenticated) return;

    // When a customer creates an account on the checkout success page and then
    // signs in, they will be redirected to the order details page with the order
    // number as orderRef, allowing the order details to be displayed
    const orderData = events.lastPayload('order/placed');
    if (orderData) {
      const url = buildOrderDetailsUrl(orderData);
      window.history.pushState({}, '', url);
    }

    window.location.reload();
  }

  function handleCheckoutValues(payload) {
    const { isBillToShipping } = payload;
    $billingForm.style.display = isBillToShipping ? 'none' : 'block';
  }

  async function handleOrderPlaced(orderData) {
    // Clear address form data
    sessionStorage.removeItem(SHIPPING_ADDRESS_DATA_KEY);
    sessionStorage.removeItem(BILLING_ADDRESS_DATA_KEY);

    const url = buildOrderDetailsUrl(orderData);

    window.history.pushState({}, '', url);

    await renderCheckoutSuccess(block, { orderData });
  }

  events.on('authenticated', handleAuthenticated);
  events.on('checkout/initialized', handleCheckoutUpdated, { eager: true });
  events.on('checkout/updated', handleCheckoutUpdated);
  events.on('checkout/values', handleCheckoutValues);
  events.on('order/placed', handleOrderPlaced);
  events.on('cart/initialized', redirectToCartIfEmpty, { eager: true });
  events.on('cart/data', redirectToCartIfEmpty);
}
