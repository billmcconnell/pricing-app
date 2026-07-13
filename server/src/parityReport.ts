// Workbook parity: diff the app's prices against what the legacy Excel dashboard
// served (Pricing Worksheet column U), normalizing for the two deliberate
// deviations — the gross-margin rule (ADR-0001) and the removed Value Uplift
// (ADR-0002). After normalization, any remaining delta means the engine's
// formulas diverge from the workbook's — a transcription error.
import { loadCostModelAssumptions } from './assumptions.js';
import { computeCost } from './costModel.js';
import type { Db } from './db.js';
import { parseCsv } from './feedFiles.js';
import { environments } from './schema.js';

// The legacy dashboard's pricing rules, frozen here for normalization only —
// the app itself never uses them.
export const LEGACY = { markup: 1.7, rounding: 500, floor: 30000, valueUplift: 43500 };

export type LegacyPriceRow = {
  identifier: string;
  legacyOpex: number;
  /** Column U, "VALUE UPLIFT LP" — the price the old dashboard actually served. */
  legacyServedPrice: number;
  /** Column V (U − floored price). > 0 means the Value Uplift applied to this row. */
  upliftAmount: number;
};

export function loadLegacyPrices(csvText: string): LegacyPriceRow[] {
  return parseCsv(csvText)
    .slice(1) // header
    .map((cells) => ({
      identifier: String(cells[0]),
      legacyOpex: Number(cells[1]),
      legacyServedPrice: Number(cells[2]),
      upliftAmount: Number(cells[3]),
    }));
}

/**
 * What the legacy workbook would charge for a given OPEX. Note the workbook quirk,
 * reproduced deliberately: the uplift is added to the *pre-floor* price P, so an
 * uplifted row never sees the $30K floor.
 */
export function predictedLegacyPrice(opex: number, uplifted: boolean): number {
  const preFloor = Math.ceil((opex * LEGACY.markup) / LEGACY.rounding) * LEGACY.rounding;
  return uplifted ? preFloor + LEGACY.valueUplift : Math.max(preFloor, LEGACY.floor);
}

export type ParityRow = {
  identifier: string;
  appOpex: number | null;
  appListPrice: number | null;
  legacyOpex: number;
  legacyServedPrice: number;
  /** Raw price difference (app − legacy): expected to be large, per the ADRs. */
  delta: number | null;
  /** The legacy price re-derived from the app's OPEX under legacy rules. */
  predictedLegacyPrice: number | null;
  /** legacy served − predicted: zero unless the engine's OPEX diverges from the workbook's. */
  normalizedDelta: number | null;
  ok: boolean;
  note: string | null;
};

export type ParityReport = {
  rows: ParityRow[];
  summary: {
    total: number;
    ok: number;
    exceptions: ParityRow[];
    maxAbsNormalizedDelta: number;
    maxAbsOpexDelta: number;
  };
};

export function buildParityReport(
  db: Db,
  legacy: LegacyPriceRow[],
  toleranceUsd = 500,
): ParityReport {
  const a = loadCostModelAssumptions(db);
  const byIdentifier = new Map(db.select().from(environments).all().map((e) => [e.identifier, e]));

  const rows: ParityRow[] = legacy.map((l) => {
    const env = byIdentifier.get(l.identifier);
    if (!env) {
      return {
        identifier: l.identifier,
        appOpex: null,
        appListPrice: null,
        legacyOpex: l.legacyOpex,
        legacyServedPrice: l.legacyServedPrice,
        delta: null,
        predictedLegacyPrice: null,
        normalizedDelta: null,
        ok: false,
        note: 'Environment not found in app data — import the spaceused feed first',
      };
    }
    const result = computeCost(
      { dbSizeGb: env.dbSizeGb, growthRate: env.growthRate ?? a.growthFloor },
      a,
    );
    const predicted = predictedLegacyPrice(result.opex, l.upliftAmount > 0);
    const normalizedDelta = l.legacyServedPrice - predicted;
    return {
      identifier: l.identifier,
      appOpex: result.opex,
      appListPrice: result.listPrice,
      legacyOpex: l.legacyOpex,
      legacyServedPrice: l.legacyServedPrice,
      delta: result.listPrice - l.legacyServedPrice,
      predictedLegacyPrice: predicted,
      normalizedDelta,
      ok: Math.abs(normalizedDelta) <= toleranceUsd,
      note: null,
    };
  });

  const exceptions = rows.filter((r) => !r.ok);
  return {
    rows,
    summary: {
      total: rows.length,
      ok: rows.length - exceptions.length,
      exceptions,
      maxAbsNormalizedDelta: Math.max(0, ...rows.map((r) => Math.abs(r.normalizedDelta ?? 0))),
      maxAbsOpexDelta: Math.max(
        0,
        ...rows.map((r) => (r.appOpex === null ? 0 : Math.abs(r.appOpex - r.legacyOpex))),
      ),
    },
  };
}
