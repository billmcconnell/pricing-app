// Print the workbook parity report against the app database.
// Usage: pnpm report:parity [--all]   (--all lists every row, not just exceptions)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, defaultDbPath } from '../db.js';
import { environments } from '../schema.js';
import { buildParityReport, loadLegacyPrices } from '../parityReport.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, '..', '..', 'test', 'fixtures', 'legacy-prices.csv');

const db = createDb(defaultDbPath());
if (db.select().from(environments).all().length === 0) {
  console.error('No Environments in the database — import the spaceused and Growth Rate feeds first.');
  process.exit(1);
}

const legacy = loadLegacyPrices(readFileSync(fixture, 'utf8'));
const report = buildParityReport(db, legacy);

const usd = (n: number | null) => (n === null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`);
const showAll = process.argv.includes('--all');
const rows = showAll ? report.rows : report.summary.exceptions;

if (rows.length > 0) {
  console.table(
    rows.map((r) => ({
      environment: r.identifier,
      'app price': usd(r.appListPrice),
      'legacy price': usd(r.legacyServedPrice),
      delta: usd(r.delta),
      'normalized Δ': usd(r.normalizedDelta),
      ok: r.ok ? '✓' : '✗',
      note: r.note ?? '',
    })),
  );
}

const s = report.summary;
console.log(
  `\n${s.ok}/${s.total} Environments at parity after normalizing for ADR-0001 (gross margin) and ADR-0002 (no Value Uplift).`,
);
console.log(
  `max |normalized Δ|: ${usd(s.maxAbsNormalizedDelta)}   max |OPEX Δ|: $${s.maxAbsOpexDelta.toFixed(4)}`,
);
if (s.exceptions.length > 0) {
  console.log(`\n${s.exceptions.length} exceptions — likely formula transcription errors. Investigate before trusting prices.`);
  process.exit(1);
}
console.log(showAll ? '' : 'No exceptions. Run with --all to list every Environment.');
