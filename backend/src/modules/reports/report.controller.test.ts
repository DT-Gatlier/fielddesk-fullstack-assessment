import { describe, expect, it } from 'vitest';
import { csvCell } from './report.controller.js';

describe('CSV export escaping', () => {
  it.each(['=SUM(A1:A2)', '+cmd', '-10+20', '@payload', '\tformula'])('neutralises spreadsheet formula input %s', (input) => {
    expect(csvCell(input)).toBe(`"'${input}"`);
  });

  it('quotes commas and double quotes', () => {
    expect(csvCell('Site "A", west')).toBe('"Site ""A"", west"');
  });
});
