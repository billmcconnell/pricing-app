import { eq, inArray } from 'drizzle-orm';
import type { Db } from './db.js';
import type { AccountNameRow, GrowthRateRow, SpaceusedRow } from './feeds.js';
import { customers, environments, imports } from './schema.js';

const MB_PER_GB = 1000;

export type SpaceusedDiff = {
  created: { identifier: string; companyCode: string; dbSizeGb: number }[];
  updated: { identifier: string; oldDbSizeGb: number; newDbSizeGb: number }[];
  unchangedCount: number;
  /** Environments in the database whose identifier vanished from this feed. */
  missing: string[];
};

export function diffSpaceused(db: Db, rows: SpaceusedRow[]): SpaceusedDiff {
  const existing = db.select().from(environments).all();
  const byIdentifier = new Map(existing.map((e) => [e.identifier, e]));
  const feedIdentifiers = new Set(rows.map((r) => r.identifier));

  const diff: SpaceusedDiff = { created: [], updated: [], unchangedCount: 0, missing: [] };
  for (const row of rows) {
    const dbSizeGb = row.sizeMb / MB_PER_GB;
    const current = byIdentifier.get(row.identifier);
    if (!current) {
      diff.created.push({ identifier: row.identifier, companyCode: row.companyCode, dbSizeGb });
    } else if (current.dbSizeGb !== dbSizeGb) {
      diff.updated.push({
        identifier: row.identifier,
        oldDbSizeGb: current.dbSizeGb,
        newDbSizeGb: dbSizeGb,
      });
    } else {
      diff.unchangedCount++;
    }
  }
  diff.missing = existing
    .filter((e) => !feedIdentifiers.has(e.identifier))
    .map((e) => e.identifier)
    .sort();
  return diff;
}

export function commitSpaceused(db: Db, rows: SpaceusedRow[], filename: string | null): SpaceusedDiff {
  return db.transaction((tx) => {
    const diff = diffSpaceused(tx as unknown as Db, rows);

    for (const row of rows) {
      const dbSizeGb = row.sizeMb / MB_PER_GB;
      let customer = tx
        .select()
        .from(customers)
        .where(eq(customers.companyCode, row.companyCode))
        .get();
      customer ??= tx.insert(customers).values({ companyCode: row.companyCode }).returning().get();

      const existing = tx
        .select()
        .from(environments)
        .where(eq(environments.identifier, row.identifier))
        .get();
      if (existing) {
        tx.update(environments)
          .set({ dbSizeGb, missingFromLastImport: false, customerId: customer.id })
          .where(eq(environments.id, existing.id))
          .run();
      } else {
        tx.insert(environments)
          .values({ customerId: customer.id, identifier: row.identifier, dbSizeGb })
          .run();
      }
    }

    if (diff.missing.length > 0) {
      tx.update(environments)
        .set({ missingFromLastImport: true })
        .where(inArray(environments.identifier, diff.missing))
        .run();
    }

    tx.insert(imports).values({ feed: 'spaceused', rowCount: rows.length, filename }).run();
    return diff;
  });
}

export type GrowthRateDiff = {
  attached: { identifier: string; growthRate: number }[];
  updated: { identifier: string; oldGrowthRate: number; newGrowthRate: number }[];
  unchangedCount: number;
  /** Feed rows whose identifier matches no Environment — reported, not silently dropped. */
  unknownIdentifiers: string[];
};

export function diffGrowthRate(db: Db, rows: GrowthRateRow[]): GrowthRateDiff {
  const existing = db.select().from(environments).all();
  const byIdentifier = new Map(existing.map((e) => [e.identifier, e]));
  const diff: GrowthRateDiff = { attached: [], updated: [], unchangedCount: 0, unknownIdentifiers: [] };
  for (const row of rows) {
    const env = byIdentifier.get(row.identifier);
    if (!env) {
      diff.unknownIdentifiers.push(row.identifier);
    } else if (env.growthRate === null) {
      diff.attached.push({ identifier: row.identifier, growthRate: row.growthRate });
    } else if (env.growthRate !== row.growthRate) {
      diff.updated.push({
        identifier: row.identifier,
        oldGrowthRate: env.growthRate,
        newGrowthRate: row.growthRate,
      });
    } else {
      diff.unchangedCount++;
    }
  }
  return diff;
}

export function commitGrowthRate(db: Db, rows: GrowthRateRow[], filename: string | null): GrowthRateDiff {
  return db.transaction((tx) => {
    const diff = diffGrowthRate(tx as unknown as Db, rows);
    const unknown = new Set(diff.unknownIdentifiers);
    for (const row of rows) {
      if (unknown.has(row.identifier)) continue;
      tx.update(environments)
        .set({ growthRate: row.growthRate })
        .where(eq(environments.identifier, row.identifier))
        .run();
    }
    tx.insert(imports)
      .values({ feed: 'growth-rate', rowCount: rows.length - unknown.size, filename })
      .run();
    return diff;
  });
}

export type AccountNamesDiff = {
  namesSet: { companyCode: string; oldAccountName: string | null; accountName: string }[];
  customersCreated: string[];
  unchangedCount: number;
};

export function diffAccountNames(db: Db, rows: AccountNameRow[]): AccountNamesDiff {
  const existing = db.select().from(customers).all();
  const byCode = new Map(existing.map((c) => [c.companyCode, c]));
  const diff: AccountNamesDiff = { namesSet: [], customersCreated: [], unchangedCount: 0 };
  for (const row of rows) {
    const current = byCode.get(row.companyCode);
    if (!current) {
      diff.customersCreated.push(row.companyCode);
      diff.namesSet.push({ companyCode: row.companyCode, oldAccountName: null, accountName: row.accountName });
    } else if (current.accountName !== row.accountName) {
      diff.namesSet.push({
        companyCode: row.companyCode,
        oldAccountName: current.accountName,
        accountName: row.accountName,
      });
    } else {
      diff.unchangedCount++;
    }
  }
  return diff;
}

export function commitAccountNames(
  db: Db,
  rows: AccountNameRow[],
  filename: string | null,
): AccountNamesDiff {
  return db.transaction((tx) => {
    const diff = diffAccountNames(tx as unknown as Db, rows);
    for (const row of rows) {
      const existing = tx
        .select()
        .from(customers)
        .where(eq(customers.companyCode, row.companyCode))
        .get();
      if (existing) {
        if (existing.accountName !== row.accountName) {
          tx.update(customers)
            .set({ accountName: row.accountName })
            .where(eq(customers.id, existing.id))
            .run();
        }
      } else {
        tx.insert(customers)
          .values({ companyCode: row.companyCode, accountName: row.accountName })
          .run();
      }
    }
    tx.insert(imports).values({ feed: 'account-names', rowCount: rows.length, filename }).run();
    return diff;
  });
}
