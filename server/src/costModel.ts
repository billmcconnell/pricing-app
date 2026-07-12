// Pure cost model — no I/O. Formulas transcribed from the workbook's
// Pricing Worksheet base model (rows 17–49) and per-client pipeline (rows 100+),
// except List Price, which uses the gross-margin rule (ADR-0001) and has no
// Value Uplift (ADR-0002).

const HOURS_PER_MONTH = 730;
const MONTHS_PER_YEAR = 12;
const FULL_RELOADS_PER_YEAR = 2;

export type CreditTier = {
  /** Tier applies when grown size strictly exceeds this many GB. */
  overGrownGb: number;
  creditsPerMonth: number;
};

export type CostModelAssumptions = {
  monthlyTurnoverRate: number;
  contingencyRate: number;
  growthFloor: number;
  snowflakeCreditPrice: number;
  snowflakeStoragePricePerTbMonth: number;
  dmsInstanceHourly: number;
  dmsInstanceStorageGb: number;
  dmsInstanceStoragePricePerGbMonth: number;
  dmsTasksPerInstance: number;
  vpcDataTransferPricePerGb: number;
  s3StoragePricePerGbMonth: number;
  s3DataTransferPricePerGb: number;
  snowpipeCreditsPerGb: number;
  serverlessCreditsPerGbMonth: number;
  dataloadWarehouseCreditsPerMonth: number;
  grossMargin: number;
  priceFloor: number;
  priceRounding: number;
  /** Sorted by overGrownGb descending; the last tier is the base allocation. */
  creditTiers: CreditTier[];
};

export type CostModelInputs = {
  dbSizeGb: number;
  growthRate: number;
};

export type CostBreakdown = ReturnType<typeof computeCost>;

export function creditsForGrownSize(grownSizeGb: number, tiers: CreditTier[]): number {
  const tier = tiers.find((t) => grownSizeGb > t.overGrownGb);
  return (tier ?? tiers[tiers.length - 1]).creditsPerMonth;
}

export function computeCost(inputs: CostModelInputs, a: CostModelAssumptions) {
  const effectiveGrowthRate = Math.max(inputs.growthRate, a.growthFloor);
  const grownSizeGb = inputs.dbSizeGb * (1 + effectiveGrowthRate);

  // GB moved per year by transactional changes (turnover % of the DB, monthly).
  const yearlyTurnoverGb = grownSizeGb * a.monthlyTurnoverRate * MONTHS_PER_YEAR;
  const reloadGb = grownSizeGb * FULL_RELOADS_PER_YEAR;

  const dms =
    (HOURS_PER_MONTH * MONTHS_PER_YEAR * a.dmsInstanceHourly +
      MONTHS_PER_YEAR * a.dmsInstanceStorageGb * a.dmsInstanceStoragePricePerGbMonth) /
    a.dmsTasksPerInstance;
  const dataloadAlerts =
    a.dataloadWarehouseCreditsPerMonth * MONTHS_PER_YEAR * a.snowflakeCreditPrice;
  const fixedTotal = dms + dataloadAlerts;

  const sqlToDmsTransfer = (yearlyTurnoverGb + reloadGb) * a.vpcDataTransferPricePerGb;
  const dmsToS3Transfer = (yearlyTurnoverGb + reloadGb) * a.vpcDataTransferPricePerGb;
  const sqs = 0;
  const s3Storage =
    (grownSizeGb + yearlyTurnoverGb) * MONTHS_PER_YEAR * a.s3StoragePricePerGbMonth;
  const s3DataTransfer = (reloadGb + yearlyTurnoverGb) * a.s3DataTransferPricePerGb;
  const snowflakeStorage =
    (a.snowflakeStoragePricePerTbMonth / 1000) * grownSizeGb * MONTHS_PER_YEAR;
  const snowpipe = yearlyTurnoverGb * a.snowpipeCreditsPerGb * a.snowflakeCreditPrice;
  const serverlessTasks =
    grownSizeGb * a.serverlessCreditsPerGbMonth * a.snowflakeCreditPrice * MONTHS_PER_YEAR;
  const variableTotal =
    sqlToDmsTransfer +
    dmsToS3Transfer +
    sqs +
    s3Storage +
    s3DataTransfer +
    snowflakeStorage +
    snowpipe +
    serverlessTasks;

  const contingency = variableTotal * a.contingencyRate;

  const creditsPerMonth = creditsForGrownSize(grownSizeGb, a.creditTiers);
  const creditCost = creditsPerMonth * a.snowflakeCreditPrice * MONTHS_PER_YEAR;

  const opex = fixedTotal + variableTotal + contingency + creditCost;

  const rawListPrice = opex / (1 - a.grossMargin);
  const roundedListPrice = Math.ceil(rawListPrice / a.priceRounding) * a.priceRounding;
  const listPrice = Math.max(roundedListPrice, a.priceFloor);

  return {
    inputs: { ...inputs, effectiveGrowthRate },
    grownSizeGb,
    fixedCosts: { dms, dataloadAlerts, total: fixedTotal },
    variableCosts: {
      sqlToDmsTransfer,
      dmsToS3Transfer,
      sqs,
      s3Storage,
      s3DataTransfer,
      snowflakeStorage,
      snowpipe,
      serverlessTasks,
      total: variableTotal,
    },
    contingency,
    snowflakeCredits: { creditsPerMonth, cost: creditCost },
    opex,
    grossMargin: a.grossMargin,
    listPrice,
  };
}
