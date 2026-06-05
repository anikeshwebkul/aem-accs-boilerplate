# Commerce Verification Block

## Overview

The Commerce Verification block renders a customer's identity-verification status badge and, when OTP verification is enabled and the customer is in the `AWAITING_OTP` state, an inline form to request and submit a one-time passcode. It reads context from `scripts/verification/verification.js` and reflects the backend state machine's UPPERCASE status vocabulary: `UNVERIFIED`, `AWAITING_OTP`, `PENDING`, `AWAITING_APPROVAL`, `VERIFIED`, `REJECTED`.

## Integration

<!-- ### Block Configuration

No block configuration is read via `readBlockConfig()`. -->

<!-- ### URL Parameters

No URL parameters directly affect this block's behavior. -->

<!-- ### Local Storage

No localStorage keys are used by this block. -->

<!-- ### Events

#### Event Listeners

No direct event listeners are implemented in this block.

#### Event Emitters

No events are emitted by this block. -->

## Behavior Patterns

### Page Context Detection

- **Unauthenticated Users**: When no customer token cookie is present, displays a "Please sign in" message and returns.
- **UNVERIFIED**: Customer has no verification record yet; displays "Not verified" badge.
- **AWAITING_OTP**: Customer must verify via OTP; displays badge and, when `settings.methods.otp` is enabled, the OTP form.
- **PENDING / AWAITING_APPROVAL**: Customer is under manual review; displays "Pending review" badge.
- **VERIFIED**: Verification complete; displays "Verified" badge.
- **REJECTED**: Verification denied; displays "Rejected" badge with the rejection reason if available.

### User Interaction Flows

1. **Send OTP**: Customer clicks "Send code"; the block calls `requestOtp()` and shows a confirmation or error message.
2. **Submit OTP**: Customer enters their code and clicks "Verify"; the block calls `verifyOtp(code)`. On success it shows a "Verified! Reloading…" message and reloads the page to reflect the new status.

### Error Handling

- **Network / token errors in OTP handlers**: Both click handlers are wrapped in try/catch; failures show a human-readable inline message without crashing the block.
- **Context fetch failure**: `getVerificationContext()` fails open — on error it returns `{ settings: null, status: undefined }`. The block treats `undefined` status as `UNVERIFIED` so the page always renders something sensible.
- **No token**: If `getCustomerToken()` returns falsy the block renders a sign-in prompt and exits early.
