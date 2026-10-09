import { formatCsvRow, sanitizeCsvField } from './csv-sanitizer';

describe('sanitizeCsvField', () => {
  it('handles null and undefined as empty quoted strings', () => {
    expect(sanitizeCsvField(null)).toBe('""');
    expect(sanitizeCsvField(undefined)).toBe('""');
  });

  it('quotes standard alphanumeric strings', () => {
    expect(sanitizeCsvField('WO-2026-0001')).toBe('"WO-2026-0001"');
    expect(sanitizeCsvField('HVAC Repair')).toBe('"HVAC Repair"');
  });

  it('escapes internal double quotes per RFC 4180', () => {
    expect(sanitizeCsvField('Unit "A" compressor')).toBe('"Unit ""A"" compressor"');
  });

  it('formats Date objects as ISO strings', () => {
    const date = new Date('2026-08-04T10:30:00.000Z');
    expect(sanitizeCsvField(date)).toBe('"2026-08-04T10:30:00.000Z"');
  });

  it('neutralizes spreadsheet formula injection (=, +, -, @, tabs)', () => {
    expect(sanitizeCsvField('=1+1')).toBe('"\'=1+1"');
    expect(sanitizeCsvField('+SUM(A1:A10)')).toBe('"\'+SUM(A1:A10)"');
    expect(sanitizeCsvField('-cmd|calc')).toBe('"\'-cmd|calc"');
    expect(sanitizeCsvField('@HYPERLINK("http://attacker.com")')).toBe(
      '"\'@HYPERLINK(""http://attacker.com"")"',
    );
    expect(sanitizeCsvField('\tcmd')).toBe('"\'\tcmd"');
    expect(sanitizeCsvField('\rcmd')).toBe('"\'\rcmd"');
  });
});

describe('formatCsvRow', () => {
  it('formats array into comma-separated line ending in CRLF', () => {
    const row = formatCsvRow(['WO-001', 'Fix pipe', 42, '=danger']);
    expect(row).toBe('"WO-001","Fix pipe","42","\'=danger"\r\n');
  });
});
