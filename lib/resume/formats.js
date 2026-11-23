export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_BATCH_FILES = 20;
export const RESUME_TYPES = Object.freeze({
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  txt: 'text/plain',
  md: 'text/markdown',
});
export const RESUME_ACCEPT = Object.keys(RESUME_TYPES).map(ext => '.' + ext).join(',');
export const SUPPORTED_RESUMES = 'PDF, DOC, DOCX, ODT, TXT or Markdown';

export function fileExtension(name) {
  return /\.([a-z0-9]+)$/i.exec(String(name ?? ''))?.[1].toLowerCase() || '';
}

export function contentTypeFor(name) {
  const ext = fileExtension(name);
  return Object.hasOwn(RESUME_TYPES, ext) ? RESUME_TYPES[ext] : null;
}

export function fileTypeError(name, type) {
  const expected = contentTypeFor(name);
  if (!expected) return 'Choose a resume in one of these formats: ' + SUPPORTED_RESUMES + '.';
  const mime = (type || '').split(';')[0].trim().toLowerCase();
  if (!mime || mime === expected || mime === 'application/octet-stream') return null;
  if (expected === RESUME_TYPES.md && ['text/plain', 'text/x-markdown'].includes(mime)) return null;
  return `The file type (${mime}) does not match its .${fileExtension(name)} extension.`;
}

export function validateResumeFile({name, size, type}) {
  const error = fileTypeError(name, type);
  if (error) return error;
  if (!Number.isFinite(size) || size <= 0) return 'The resume file is empty.';
  if (size > MAX_RESUME_BYTES) return 'Resumes must be 5 MB or smaller.';
  return null;
}
