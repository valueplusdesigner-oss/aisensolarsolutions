/**
 * Quote a value as an RFC 4180-style CSV field while preventing spreadsheet
 * applications from executing user-submitted formula-like content.
 * All enquiry values are untrusted input, including phone numbers beginning +.
 */
export function quoteCsvCell(value) {
  const raw = String(value ?? '');
  // Place apostrophe at the very start, even when a formula follows spaces.
  // Spreadsheet tools generally treat leading apostrophes as text markers.
  const escapedFormula = /^\s*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${escapedFormula.replaceAll('"', '""')}"`;
}
