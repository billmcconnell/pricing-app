import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, type Db } from '../src/db.js';
import { assumptions } from '../src/schema.js';
import { parseCsv } from '../src/feedFiles.js';
import { parseGrowthRate, parseSpaceused } from '../src/feeds.js';
import { commitGrowthRate, commitSpaceused } from '../src/imports.js';
import {
  buildParityReport,
  loadLegacyPrices,
  predictedLegacyPrice,
  type ParityReport,
} from '../src/parityReport.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

let db: Db;
let report: ParityReport;

beforeAll(() => {
  db = createDb(':memory:');
  const spaceused = parseSpaceused(parseCsv(readFileSync(join(fixtures, 'spaceused.csv'), 'utf8')));
  const growth = parseGrowthRate(parseCsv(readFileSync(join(fixtures, 'growth-rate.csv'), 'utf8')));
  expect(spaceused.errors).toEqual([]);
  expect(growth.errors).toEqual([]);
  commitSpaceused(db, spaceused.rows, 'spaceused.csv');
  commitGrowthRate(db, growth.rows, 'growth-rate.csv');
  const legacy = loadLegacyPrices(readFileSync(join(fixtures, 'legacy-prices.csv'), 'utf8'));
  report = buildParityReport(db, legacy);
});

describe('predictedLegacyPrice', () => {
  it('reproduces the workbook rules: CEILING(OPEX × 1.7, 500), $30K floor, uplift skips the floor', () => {
    // OTQV: OPEX 44,617.963… × 1.7 = 75,850.5… → ceiling 76,000; uplifted ⇒ +43,500.
    expect(predictedLegacyPrice(44617.963214242, false)).toBe(76000);
    expect(predictedLegacyPrice(44617.963214242, true)).toBe(119500);
    // A small client: pre-floor price 18,500 → floored to 30,000 without uplift,
    // but an uplifted row gets 18,500 + 43,500 = 62,000 (the workbook quirk).
    expect(predictedLegacyPrice(10800, false)).toBe(30000);
    expect(predictedLegacyPrice(10800, true)).toBe(62000);
  });
});

describe('workbook parity report (regression gate)', () => {
  it('covers the legacy dashboard client base', () => {
    expect(report.summary.total).toBe(289);
    expect(report.rows.every((r) => r.appListPrice !== null)).toBe(true);
  });

  it('every normalized delta is zero — no formula transcription errors', () => {
    for (const row of report.rows) {
      expect(row.normalizedDelta, row.identifier).toBe(0);
    }
    expect(report.summary.exceptions).toEqual([]);
    expect(report.summary.maxAbsNormalizedDelta).toBe(0);
  });

  it('the engine reproduces the workbook OPEX to the cent on every client', () => {
    for (const row of report.rows) {
      expect(Math.abs(row.appOpex! - row.legacyOpex), row.identifier).toBeLessThan(0.01);
    }
  });

  it('raw deltas show the expected ADR-driven direction', () => {
    // ADR-0001 prices ≈ 2.5/1.7 higher; ADR-0002 removes the uplift. Every non-uplifted
    // client must be at or above legacy; only heavily-uplifted rows can come out lower.
    const legacy = loadLegacyPrices(readFileSync(join(fixtures, 'legacy-prices.csv'), 'utf8'));
    const upliftByIdentifier = new Map(legacy.map((l) => [l.identifier, l.upliftAmount]));
    for (const row of report.rows) {
      if (upliftByIdentifier.get(row.identifier) === 0) {
        expect(row.delta!, row.identifier).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('a deliberately broken Assumption is caught', () => {
    // Sanity-check the gate itself: corrupt one unit cost and the report must light up.
    const brokenDb = createDb(':memory:');
    const spaceused = parseSpaceused(parseCsv(readFileSync(join(fixtures, 'spaceused.csv'), 'utf8')));
    const growth = parseGrowthRate(parseCsv(readFileSync(join(fixtures, 'growth-rate.csv'), 'utf8')));
    commitSpaceused(brokenDb, spaceused.rows, null);
    commitGrowthRate(brokenDb, growth.rows, null);
    brokenDb
      .update(assumptions)
      .set({ value: 2.0 })
      .where(eq(assumptions.key, 'snowpipe_credits_per_gb'))
      .run();
    const legacy = loadLegacyPrices(readFileSync(join(fixtures, 'legacy-prices.csv'), 'utf8'));
    const broken = buildParityReport(brokenDb, legacy);
    expect(broken.summary.exceptions.length).toBeGreaterThan(0);
  });
});
