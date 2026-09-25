const DRIVE_ID_PATTERNS = [/\/file\/d\/([a-zA-Z0-9_-]{10,})/, /[?&]id=([a-zA-Z0-9_-]{10,})/];

/**
 * Normalizes a pasted document link into a value safe to store as Document.fileUrl.
 * Google Drive share links only embed in an <iframe> via their /preview path (the
 * default /view path sends X-Frame-Options: SAMEORIGIN and refuses to load here), so
 * any recognizable Drive link is rewritten to that form. Returns null if the value
 * isn't a usable https URL, or looks like a Drive link but has no extractable file id.
 */
export function normalizeExternalDocUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try { url = new URL(trimmed); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (/(^|\.)drive\.google\.com$/i.test(url.hostname)) {
    for (const pattern of DRIVE_ID_PATTERNS) {
      const match = trimmed.match(pattern);
      if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
    return null;
  }
  return url.toString();
}

export function isExternalDocUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}
