/* blocks/commerce-verification/commerce-verification.js */
import { getCustomerToken } from '../../scripts/verification/verification.js';
import { renderUploadWidget } from '../../scripts/verification/upload-widget.js';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export default async function decorate(block) {
  block.textContent = '';
  const container = el('div', 'cv-hub');
  block.append(container);

  if (!getCustomerToken()) {
    container.append(el('p', 'cv-msg', 'Please sign in to manage verification.'));
    return;
  }

  await renderUploadWidget(container);
}
