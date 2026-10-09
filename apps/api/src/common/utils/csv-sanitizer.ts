/**
 * Sanitizes CSV field values conforming to RFC 4180 while completely
 * neutralizing Spreadsheet Formula Injection (CSV Injection / CWE-1236).
 *
 * Spreadsheet programs (Microsoft Excel, LibreOffice Calc, Google Sheets) execute
 * arbitrary formulas if unquoted or quoted strings begin with `=, +, -, @, \t, \r`.
 * Prepending a single quote (`'`) neutralizes active evaluation while preserving
 * human readability. Double quotes are properly doubled (`""`) and fields are enclosed
 * in RFC 4180 double quotes.
 */
export function sanitizeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '""';
  }

  let text: string;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'string') {
    text = value;
  } else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    text = value.toString();
  } else {
    text = JSON.stringify(value) ?? '';
  }

  // Neutralize formula injection risk if starting with formula triggers or whitespace controls
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  // Escape internal double quotes per RFC 4180
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Formats an array of row values into an RFC 4180 compliant CSV record line with CRLF.
 */
export function formatCsvRow(values: unknown[]): string {
  return `${values.map(sanitizeCsvField).join(',')}\r\n`;
}
