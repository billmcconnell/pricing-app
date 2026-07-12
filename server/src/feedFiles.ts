import ExcelJS from 'exceljs';

export type Cell = string | number | null;

/** Minimal CSV parser with quoted-field support. */
export function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row.map((f) => f.trim()));
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows.filter((r) => r.some((c) => c !== ''));
}

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('result' in value && value.result !== undefined) return cellValue(value.result as ExcelJS.CellValue);
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value) return value.text;
  }
  return String(value);
}

export async function parseXlsx(buffer: Buffer): Promise<Cell[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: Cell[][] = [];
  sheet.eachRow((row) => {
    const cells: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellValue(cell.value));
    });
    if (cells.some((c) => c !== null && c !== '')) rows.push(cells);
  });
  return rows;
}

/** Parse an uploaded feed file (CSV or xlsx, by file extension) into a cell table. */
export async function tableFromUpload(filename: string, buffer: Buffer): Promise<Cell[][]> {
  if (/\.xlsx$/i.test(filename)) return parseXlsx(buffer);
  if (/\.csv$/i.test(filename)) return parseCsv(buffer.toString('utf8'));
  throw new Error(`Unsupported file type: ${filename} (expected .csv or .xlsx)`);
}
