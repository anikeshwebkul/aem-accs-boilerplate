/* scripts/verification/guest-otp.js
 *
 * Guest email verification (OTP) widget for checkout. A guest enters their
 * email, receives a one-time code, and verifies it before placing the order.
 * Backend: cv-otp-request / cv-otp-verify / cv-guest-verified.
 */
import { requestGuestOtp, verifyGuestOtp, fetchGuestVerified } from './verification.js';

const ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Render the guest OTP widget.
 *
 * @param {HTMLElement} container
 * @param {{ email?: string, onChange?: (verified:boolean)=>void }} opts
 * @returns {{ isVerified, getEmail, setEmail, destroy }} controller
 */
export function renderGuestVerification(container, opts = {}) {
  const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
  let email = (opts.email || '').trim();
  let verified = false;
  let codeSent = false;

  const setVerified = (v) => {
    if (verified === v) return;
    verified = v;
    onChange(verified);
  };

  function render() {
    container.textContent = '';
    const meta = verified ? 'approved' : 'required';
    const card = el('div', `cv-card cv-card--${meta}`);

    // Header
    const head = el('div', 'cv-card__head');
    const badge = el('span', `cv-card__badge cv-card__badge--${verified ? 'approved' : 'unverified'}`);
    badge.innerHTML = ICON_SHIELD;
    const titles = el('div', 'cv-card__titles');
    titles.append(el('h3', 'cv-card__title', 'Verify your email'));
    titles.append(el('span', `cv-pill cv-pill--${verified ? 'approved' : 'required'}`, verified ? 'Verified' : 'Required'));
    head.append(badge, titles);
    card.append(head);

    if (verified) {
      const b = el('div', 'cv-banner cv-banner--approved');
      b.append(el('span', null, 'Your email is verified. You can place your order.'));
      card.append(b);
      container.append(card);
      return;
    }

    card.append(el('p', 'cv-card__desc', 'Enter your email to receive a one-time verification code, then enter the code to continue.'));

    const err = el('p', 'cv-error');

    // Email row
    const emailInput = el('input', 'cv-input');
    emailInput.type = 'email';
    emailInput.placeholder = 'you@example.com';
    emailInput.value = email;
    emailInput.autocomplete = 'email';
    emailInput.addEventListener('input', () => { email = emailInput.value.trim(); });

    const sendBtn = el('button', 'cv-submit');
    sendBtn.type = 'button';
    sendBtn.textContent = codeSent ? 'Resend code' : 'Send code';

    // Code row (shown after a code is sent)
    const codeInput = el('input', 'cv-input');
    codeInput.type = 'text';
    codeInput.inputMode = 'numeric';
    codeInput.placeholder = 'Enter 6-digit code';
    codeInput.maxLength = 6;

    const verifyBtn = el('button', 'cv-submit');
    verifyBtn.type = 'button';
    verifyBtn.textContent = 'Verify';

    const note = el('p', 'cv-note');

    sendBtn.addEventListener('click', async () => {
      err.textContent = '';
      note.textContent = '';
      if (!EMAIL_RE.test(email)) { err.textContent = 'Enter a valid email address.'; return; }
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      try {
        const r = await requestGuestOtp(email);
        if (r && r.ok) {
          codeSent = true;
          note.textContent = `We sent a code to ${email}. Check your inbox.`;
          render();
        } else {
          sendBtn.disabled = false;
          sendBtn.textContent = 'Send code';
          err.textContent = `Could not send a code (${(r && r.reason) || 'error'}).`;
        }
      } catch (e) {
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send code';
        err.textContent = 'Could not send a code. Please try again.';
      }
    });

    verifyBtn.addEventListener('click', async () => {
      err.textContent = '';
      const code = codeInput.value.trim();
      if (!code) { err.textContent = 'Enter the code from your email.'; return; }
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying…';
      try {
        const r = await verifyGuestOtp(email, code);
        if (r && r.ok) {
          setVerified(true);
          render();
        } else {
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify';
          const reasons = {
            mismatch: 'Incorrect code. Please try again.',
            expired: 'That code expired. Send a new one.',
            locked: 'Too many attempts. Send a new code.',
          };
          err.textContent = reasons[r && r.reason] || 'Verification failed. Please try again.';
        }
      } catch (e) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
        err.textContent = 'Verification failed. Please try again.';
      }
    });

    const emailRow = el('div', 'cv-otp-row');
    emailRow.append(emailInput, sendBtn);
    card.append(emailRow);

    if (codeSent) {
      const codeRow = el('div', 'cv-otp-row');
      codeRow.append(codeInput, verifyBtn);
      card.append(codeRow);
    }
    card.append(note, err);
    container.append(card);
  }

  // If the email is already verified server-side (e.g. page reload), reflect it.
  if (email) {
    fetchGuestVerified(email).then((r) => {
      if (r && r.verified) { setVerified(true); }
      render();
    }).catch(render);
  } else {
    render();
  }

  return {
    isVerified: () => verified,
    getEmail: () => email,
    setEmail: (e) => {
      const next = (e || '').trim();
      if (next === email) return;
      email = next;
      verified = false;
      codeSent = false;
      onChange(false);
      if (email) {
        fetchGuestVerified(email).then((r) => {
          if (r && r.verified) setVerified(true);
          render();
        }).catch(render);
      } else {
        render();
      }
    },
    destroy: () => { container.textContent = ''; },
  };
}
