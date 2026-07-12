import { describe, expect, it } from 'vitest';
import { parseCsv } from '../src/feedFiles.js';
import { parseAccountNames, parseSpaceused } from '../src/feeds.js';

describe('parseCsv', () => {
  it('parses rows, trims fields, and skips blank lines', () => {
    expect(parseCsv('a,b\r\n1, 2\n\n3,4\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('"Acme, Inc.","says ""hi"""\n')).toEqual([['Acme, Inc.', 'says "hi"']]);
  });
});

describe('parseSpaceused', () => {
  it('skips a header row and reads identifier + size in MB', () => {
    const { rows, errors } = parseSpaceused([
      ['Company Code', 'IMOS DB size'],
      ['OTQV', 1003483.3],
    ]);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ line: 2, identifier: 'OTQV', companyCode: 'OTQV', sizeMb: 1003483.3 }]);
  });

  it('parses full environment names down to their Company Code', () => {
    const { rows } = parseSpaceused([
      ['MOLH_imos_MPCC_PROD', 100],
      ['MOLH_imos_MOLDB_prod', 200],
    ]);
    expect(rows.map((r) => r.companyCode)).toEqual(['MOLH', 'MOLH']);
    expect(rows.map((r) => r.identifier)).toEqual(['MOLH_imos_MPCC_PROD', 'MOLH_imos_MOLDB_prod']);
  });

  it('uppercases bare company codes', () => {
    const { rows } = parseSpaceused([['evsg', 15.49]]);
    expect(rows[0].identifier).toBe('EVSG');
    expect(rows[0].companyCode).toBe('EVSG');
  });

  it('accepts numeric strings as sizes (CSV input)', () => {
    const { rows } = parseSpaceused([['OTQV', '672758']]);
    expect(rows[0].sizeMb).toBe(672758);
  });

  it('rejects malformed rows with per-row errors', () => {
    const { rows, errors } = parseSpaceused([
      ['OTQV', 'not-a-number'],
      ['TOOLONGCODE', 50],
      ['', 50],
      ['NEGA', -1],
      ['OKAY', 100],
    ]);
    expect(rows.map((r) => r.identifier)).toEqual(['OKAY']);
    expect(errors).toHaveLength(4);
    expect(errors[0]).toMatchObject({ line: 1, identifier: 'OTQV' });
    expect(errors[0].message).toContain('non-numeric size');
    expect(errors[1].message).toContain('not a 4-letter Company Code');
    expect(errors[2].message).toBe('missing identifier');
    expect(errors[3].message).toContain('must be positive');
  });

  it('keeps the first occurrence of a duplicate identifier and warns', () => {
    const { rows, warnings } = parseSpaceused([
      ['EVSG', 15.49],
      ['EVSG', 99],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sizeMb).toBe(15.49);
    expect(warnings[0]).toContain("duplicate identifier 'EVSG'");
  });
});

describe('parseAccountNames', () => {
  it('detects column order per row', () => {
    const nameFirst = parseAccountNames([
      ['Account Name', 'Company Code'],
      ['Radiant-Macaw', 'RUMB'],
    ]);
    const codeFirst = parseAccountNames([['RUMB', 'Radiant-Macaw']]);
    expect(nameFirst.rows).toEqual([{ line: 2, companyCode: 'RUMB', accountName: 'Radiant-Macaw' }]);
    expect(codeFirst.rows).toEqual([{ line: 1, companyCode: 'RUMB', accountName: 'Radiant-Macaw' }]);
  });

  it('errors when no column looks like a Company Code', () => {
    const { errors } = parseAccountNames([['Radiant-Macaw', 'Not A Code']]);
    expect(errors).toHaveLength(1);
  });

  it('warns on duplicate codes, first occurrence wins', () => {
    const { rows, warnings } = parseAccountNames([
      ['First-Name', 'RUMB'],
      ['Second-Name', 'RUMB'],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].accountName).toBe('First-Name');
    expect(warnings).toHaveLength(1);
  });
});
