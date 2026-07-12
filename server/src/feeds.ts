import type { Cell } from './feedFiles.js';

export type RowIssue = { line: number; identifier: string | null; message: string };

export type SpaceusedRow = {
  line: number;
  /** Raw feed identifier, e.g. 'OTQV' or 'MOLH_imos_MPCC_PROD'. */
  identifier: string;
  companyCode: string;
  sizeMb: number;
};

export type SpaceusedParse = { rows: SpaceusedRow[]; errors: RowIssue[]; warnings: string[] };

const COMPANY_CODE = /^[A-Za-z]{4}$/;

function asNumber(cell: Cell): number | null {
  if (typeof cell === 'number') return cell;
  if (typeof cell === 'string' && cell !== '' && Number.isFinite(Number(cell))) return Number(cell);
  return null;
}

// A header is only recognized when the identifier cell can't be a real identifier —
// a first data row with a malformed value must produce an error, not vanish.
function isHeaderRow(cells: Cell[]): boolean {
  const first = typeof cells[0] === 'string' ? cells[0].trim() : '';
  return (
    asNumber(cells[1] ?? null) === null &&
    !COMPANY_CODE.test(first.split('_')[0]) &&
    /company\s*code|identifier|db\s*size/i.test(first)
  );
}

/**
 * spaceused feed: identifier + database size in MB. MB→GB conversion happens at
 * this boundary and nowhere else (CONTEXT.md, IMOS DB Size) — callers get GB.
 */
export function parseSpaceused(table: Cell[][]): SpaceusedParse {
  const rows: SpaceusedRow[] = [];
  const errors: RowIssue[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  table.forEach((cells, index) => {
    const line = index + 1;
    if (index === 0 && isHeaderRow(cells)) return;

    const rawIdentifier = typeof cells[0] === 'string' ? cells[0].trim() : String(cells[0] ?? '');
    if (rawIdentifier === '') {
      errors.push({ line, identifier: null, message: 'missing identifier' });
      return;
    }
    const codePart = rawIdentifier.split('_')[0];
    if (!COMPANY_CODE.test(codePart)) {
      errors.push({
        line,
        identifier: rawIdentifier,
        message: `bad identifier: '${codePart}' is not a 4-letter Company Code`,
      });
      return;
    }
    const sizeMb = asNumber(cells[1] ?? null);
    if (sizeMb === null) {
      errors.push({ line, identifier: rawIdentifier, message: `non-numeric size: '${cells[1]}'` });
      return;
    }
    if (sizeMb <= 0) {
      errors.push({ line, identifier: rawIdentifier, message: `size must be positive: ${sizeMb}` });
      return;
    }

    const companyCode = codePart.toUpperCase();
    const identifier = rawIdentifier === codePart ? companyCode : rawIdentifier;
    if (seen.has(identifier)) {
      // First occurrence wins, matching the workbook's VLOOKUP behavior.
      warnings.push(`line ${line}: duplicate identifier '${identifier}' ignored (first occurrence wins)`);
      return;
    }
    seen.add(identifier);
    rows.push({ line, identifier, companyCode, sizeMb });
  });

  return { rows, errors, warnings };
}

export type AccountNameRow = { line: number; companyCode: string; accountName: string };
export type AccountNamesParse = { rows: AccountNameRow[]; errors: RowIssue[]; warnings: string[] };

/**
 * Company Code ↔ Account Name mapping (the workbook's cheat-sheet data).
 * Column order is detected per row: the cell matching a 4-letter code is the code.
 */
export function parseAccountNames(table: Cell[][]): AccountNamesParse {
  const rows: AccountNameRow[] = [];
  const errors: RowIssue[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  table.forEach((cells, index) => {
    const line = index + 1;
    const [a, b] = [cells[0], cells[1]].map((c) =>
      typeof c === 'string' ? c.trim() : String(c ?? ''),
    );
    const aIsCode = COMPANY_CODE.test(a);
    const bIsCode = COMPANY_CODE.test(b);
    const looksLikeHeader = /company\s*code|account\s*name/i.test(a) || /company\s*code|account\s*name/i.test(b);
    if (index === 0 && !aIsCode && !bIsCode && looksLikeHeader) return;
    if (a === '' || b === '') {
      errors.push({ line, identifier: a || b || null, message: 'expected two columns: Account Name and Company Code' });
      return;
    }
    let companyCode: string;
    let accountName: string;
    if (bIsCode && !aIsCode) {
      companyCode = b.toUpperCase();
      accountName = a;
    } else if (aIsCode && !bIsCode) {
      companyCode = a.toUpperCase();
      accountName = b;
    } else {
      errors.push({
        line,
        identifier: a,
        message: 'could not tell which column is the 4-letter Company Code',
      });
      return;
    }
    if (seen.has(companyCode)) {
      warnings.push(`line ${line}: duplicate Company Code '${companyCode}' ignored (first occurrence wins)`);
      return;
    }
    seen.add(companyCode);
    rows.push({ line, companyCode, accountName });
  });

  return { rows, errors, warnings };
}
