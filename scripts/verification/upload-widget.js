/* scripts/verification/upload-widget.js
 *
 * Customer Verification UI — a refined "secure verification" card used on the
 * registration, My Account, checkout and hub surfaces. Structure here, styling
 * in styles/lazy-styles.css (loaded globally so every surface is styled).
 */
import { getVerificationContext, uploadDocument } from './verification.js';
import { clientValidate } from './client-validate.js';
import { canReupload } from './gating.js';

const ICON = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.4 14.5A5 5 0 0016 7h-1.26A8 8 0 103 16.3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l9 15.5H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/></svg>',
};

const STATUS_META = {
  APPROVED: { label: 'Verified', mod: 'approved', icon: ICON.check },
  PENDING: { label: 'Pending review', mod: 'pending', icon: ICON.clock },
  REJECTED: { label: 'Action needed', mod: 'rejected', icon: ICON.alert },
  NOT_SUBMITTED: { label: 'Not verified', mod: 'unverified', icon: ICON.shield },
  UNVERIFIED: { label: 'Not verified', mod: 'unverified', icon: ICON.shield },
};

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function icon(name, cls) {
  const s = el('span', `cv-ico${cls ? ` ${cls}` : ''}`);
  s.innerHTML = ICON[name] || '';
  return s;
}

function prettyTypes(fu) {
  return (fu.allowedFileTypes || []).map((t) => t.toUpperCase()).join(', ');
}

/** Build a drag-and-drop dropzone. onFile(file|null) is called on selection. */
function buildDropzone(fu, onFile) {
  const zone = el('label', 'cv-dropzone');
  const input = el('input', 'cv-dropzone__input');
  input.type = 'file';
  input.accept = (fu.allowedFileTypes || []).map((t) => `.${t}`).join(',');

  const art = icon('upload', 'cv-dropzone__icon');
  const main = el('span', 'cv-dropzone__text');
  main.innerHTML = '<strong>Click to upload</strong> or drag &amp; drop';
  const hint = el('span', 'cv-dropzone__hint', `${prettyTypes(fu)} · up to ${fu.maxFileSizeMb} MB`);
  const chosen = el('span', 'cv-dropzone__file');

  zone.append(input, art, main, hint, chosen);

  const setFile = (file) => {
    if (file) {
      chosen.innerHTML = '';
      chosen.append(icon('file'), el('span', 'cv-dropzone__filename', file.name));
      zone.classList.add('is-filled');
    } else {
      chosen.textContent = '';
      zone.classList.remove('is-filled');
    }
    onFile(file || null);
  };

  input.addEventListener('change', () => setFile(input.files && input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.add('is-drag');
  }));
  ['dragleave', 'dragend', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
    e.preventDefault(); zone.classList.remove('is-drag');
  }));
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    try { input.files = e.dataTransfer.files; } catch (_) { /* read-only in some browsers */ }
    setFile(file);
  });

  return { node: zone, reset: () => setFile(null) };
}

function header(meta, title) {
  const head = el('div', 'cv-card__head');
  const badge = el('span', `cv-card__badge cv-card__badge--${meta.mod}`);
  badge.innerHTML = meta.icon;
  const titles = el('div', 'cv-card__titles');
  titles.append(el('h3', 'cv-card__title', title));
  titles.append(el('span', `cv-pill cv-pill--${meta.mod}`, meta.label));
  head.append(badge, titles);
  return head;
}

function banner(mod, iconName, text) {
  const b = el('div', `cv-banner cv-banner--${mod}`);
  b.append(icon(iconName), el('span', null, text));
  return b;
}

/**
 * Post-account widget (My Account / hub / checkout): shows status and lets the
 * customer upload — and re-upload after rejection. Uploads immediately.
 */
export async function renderUploadWidget(container, opts = {}) {
  try {
    container.textContent = '';
    const ctx = await getVerificationContext();
    if (!ctx.settings || !ctx.settings.enabled) return; // feature off
    const status = ctx.status || 'UNVERIFIED';
    const meta = STATUS_META[status] || STATUS_META.UNVERIFIED;
    const msgs = ctx.settings.messages || {};
    const fu = ctx.settings.fileUpload || { allowedFileTypes: [], maxFileSizeMb: 5 };

    const card = el('div', `cv-card cv-card--${meta.mod}`);
    card.append(header(meta, 'Identity verification'));
    if (msgs.documentDescription) card.append(el('p', 'cv-card__desc', msgs.documentDescription));

    if (status === 'APPROVED') {
      card.append(banner('approved', 'check', 'Your account is verified. You can shop and check out normally.'));
    } else if (status === 'PENDING') {
      card.append(banner('pending', 'clock', msgs.pendingMessage || 'Your document is pending admin review.'));
    } else if (status === 'REJECTED' && !canReupload(status, ctx.settings)) {
      // Re-upload after rejection is disabled by the admin (allowReupload=false).
      // Show why, and do not render an upload form that would silently fail server-side.
      card.append(banner('rejected', 'alert', ctx.reason ? `Rejected: ${ctx.reason}` : 'Your document was rejected.'));
      card.append(banner('unverified', 'alert', 'Re-uploading is currently disabled. Please contact support to resolve your verification.'));
    } else {
      if (status === 'REJECTED') {
        card.append(banner('rejected', 'alert', ctx.reason ? `Rejected: ${ctx.reason}` : 'Your document was rejected. Please upload a new one.'));
      } else if (ctx.loggedIn && ctx.settings.existingCustomersRequired && msgs.firstLoginMessage) {
        // Existing customer being asked to verify for the first time after the
        // feature was enabled — show the dedicated first-login message.
        card.append(banner('unverified', 'shield', msgs.firstLoginMessage));
      } else if (msgs.notUploadedMessage) {
        card.append(banner('unverified', 'shield', msgs.notUploadedMessage));
      }

      let file = null;
      const dz = buildDropzone(fu, (f) => { file = f; });
      const err = el('p', 'cv-error');
      const btn = el('button', 'cv-submit');
      btn.type = 'button';
      btn.innerHTML = `${ICON.upload}<span>Upload document</span>`;
      btn.addEventListener('click', async () => {
        err.textContent = '';
        if (!file) { err.textContent = 'Choose a file first.'; return; }
        const v = clientValidate({ name: file.name, size: file.size }, fu);
        if (!v.ok) {
          err.textContent = v.reason === 'size' ? `File too large (max ${fu.maxFileSizeMb} MB).` : 'File type not allowed.';
          return;
        }
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.querySelector('span').textContent = 'Uploading…';
        try {
          const r = await uploadDocument(file);
          if (r && r.ok) {
            if (opts.onUploaded) opts.onUploaded();
            await renderUploadWidget(container, opts);
          } else {
            btn.disabled = false; btn.classList.remove('is-loading');
            btn.querySelector('span').textContent = 'Upload document';
            err.textContent = `Upload failed (${(r && r.reason) || 'error'}).`;
          }
        } catch (e) {
          btn.disabled = false; btn.classList.remove('is-loading');
          btn.querySelector('span').textContent = 'Upload document';
          err.textContent = 'Upload failed. Please try again.';
        }
      });
      card.append(dz.node, err, btn);
    }

    container.append(card);
  } catch (e) {
    console.warn('[verification] upload widget skipped', e);
  }
}

/**
 * Registration-mode: holds the chosen file (no token yet); the caller enforces
 * "required" and uploads after the account is created.
 * Returns { required, requiredMessage, getFile, showError }.
 */
export async function renderRegistrationUpload(container) {
  const noop = {
    required: false, requiredMessage: '', getFile: () => null, getPending: () => null, showError: () => {},
  };
  try {
    container.textContent = '';
    const ctx = await getVerificationContext();
    if (!ctx.settings || !ctx.settings.enabled) return noop; // feature off
    const required = !ctx.settings.documentOptional;
    const fu = ctx.settings.fileUpload || { allowedFileTypes: [], maxFileSizeMb: 5 };
    const msgs = ctx.settings.messages || {};
    let file = null;
    let pending = null; // { fileName, mime, dataBase64 } — read eagerly so it is
    //                     ready before the post-signup redirect.

    const meta = { label: required ? 'Required' : 'Optional', mod: required ? 'required' : 'unverified', icon: ICON.shield };
    const card = el('div', `cv-card cv-card--${meta.mod}`);
    card.append(header(meta, 'Identity verification'));
    if (msgs.documentDescription) card.append(el('p', 'cv-card__desc', msgs.documentDescription));

    const err = el('p', 'cv-error');
    const dz = buildDropzone(fu, (f) => {
      err.textContent = '';
      pending = null;
      if (!f) { file = null; return; }
      const v = clientValidate({ name: f.name, size: f.size }, fu);
      if (!v.ok) {
        file = null; dz.reset();
        err.textContent = v.reason === 'size' ? `File too large (max ${fu.maxFileSizeMb} MB).` : 'File type not allowed.';
        return;
      }
      file = f;
      // eagerly encode so it is available synchronously at signup time
      const reader = new FileReader();
      reader.onload = () => {
        const r = String(reader.result);
        const comma = r.indexOf(',');
        const dataBase64 = comma >= 0 ? r.slice(comma + 1) : r;
        pending = { fileName: f.name, mime: f.type, dataBase64 };
      };
      reader.readAsDataURL(f);
    });
    card.append(dz.node, err);
    container.append(card);

    const requiredMessage = msgs.notUploadedMessage
      || 'Please attach your verification document to create your account.';

    return {
      required,
      requiredMessage,
      getFile: () => file,
      getPending: () => pending,
      showError: (m) => { err.textContent = m; },
    };
  } catch (e) {
    console.warn('[verification] registration upload skipped', e);
    return noop;
  }
}
