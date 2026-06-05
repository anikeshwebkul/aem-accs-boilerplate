/* scripts/verification/client-validate.js */
export function clientValidate(file, fileUpload) {
  const name = String((file && file.name) || '');
  const i = name.lastIndexOf('.');
  const ext = i >= 0 ? name.slice(i + 1).toLowerCase() : '';
  if (!ext || !fileUpload.allowedFileTypes.includes(ext)) return { ok: false, reason: 'type' };
  if (file.size > fileUpload.maxFileSizeMb * 1024 * 1024) return { ok: false, reason: 'size' };
  return { ok: true };
}
