import { describe, expect, it } from 'vitest';
import {
  computeCost,
  creditsForGrownSize,
  projectMultiYear,
  type CostModelAssumptions,
} from '../src/costModel.js';

// The workbook's Pricing Worksheet assumptions (rows 17–29), 2026-07-08 snapshot,
// plus the ADR-0001 gross-margin rule and the commercial-policy values.
const workbook: CostModelAssumptions = {
  monthlyTurnoverRate: 0.1,
  contingencyRate: 0.1,
  growthFloor: 0.3,
  snowflakeCreditPrice: 3.9,
  snowflakeStoragePricePerTbMonth: 23,
  dmsInstanceHourly: 0.92,
  dmsInstanceStorageGb: 750,
  dmsInstanceStoragePricePerGbMonth: 0.127,
  dmsTasksPerInstance: 75,
  vpcDataTransferPricePerGb: 0.01,
  s3StoragePricePerGbMonth: 0.023,
  s3DataTransferPricePerGb: 0.09,
  snowpipeCreditsPerGb: 1.11,
  serverlessCreditsPerGbMonth: 0.16,
  dataloadWarehouseCreditsPerMonth: 24,
  grossMargin: 0.6,
  priceFloor: 30000,
  priceRounding: 500,
  creditTiers: [
    { overGrownGb: 200, creditsPerMonth: 500 },
    { overGrownGb: 150, creditsPerMonth: 400 },
    { overGrownGb: 90, creditsPerMonth: 250 },
    { overGrownGb: 0, creditsPerMonth: 200 },
  ],
};

describe('base model fixture (Pricing Worksheet rows 17–49: 150 GB, 10% turnover)', () => {
  // The worksheet's base model applies no growth, so disable the floor to hit 150 GB exactly.
  const result = computeCost({ dbSizeGb: 150, growthRate: 0 }, { ...workbook, growthFloor: 0 });

  it('fixed costs match D31:D33', () => {
    expect(result.fixedCosts.dms).toBeCloseTo(122.696, 6);
    expect(result.fixedCosts.dataloadAlerts).toBeCloseTo(1123.2, 6);
    expect(result.fixedCosts.total).toBeCloseTo(1245.896, 6);
  });

  it('variable cost lines match D35:D43', () => {
    expect(result.variableCosts.sqlToDmsTransfer).toBeCloseTo(4.8, 6);
    expect(result.variableCosts.dmsToS3Transfer).toBeCloseTo(4.8, 6);
    expect(result.variableCosts.sqs).toBe(0);
    expect(result.variableCosts.s3Storage).toBeCloseTo(91.08, 6);
    expect(result.variableCosts.s3DataTransfer).toBeCloseTo(43.2, 6);
    expect(result.variableCosts.snowflakeStorage).toBeCloseTo(41.4, 6);
    expect(result.variableCosts.snowpipe).toBeCloseTo(779.22, 6);
    expect(result.variableCosts.serverlessTasks).toBeCloseTo(1123.2, 6);
    expect(result.variableCosts.total).toBeCloseTo(2087.7, 6);
  });

  it('contingency matches D47 (10% of variable costs)', () => {
    expect(result.contingency).toBeCloseTo(208.77, 6);
  });

  it('credit allocation for 150 GB is 250 credits/month, $11,700/yr (D45)', () => {
    expect(result.snowflakeCredits.creditsPerMonth).toBe(250);
    expect(result.snowflakeCredits.cost).toBeCloseTo(11700, 6);
  });

  it('OPEX matches D49', () => {
    expect(result.opex).toBeCloseTo(15242.366, 6);
  });
});

describe('per-client pipeline fixtures (Pricing Worksheet rows 100+)', () => {
  it('OTQV: 1,003,483.3 MB at 30% growth reproduces the workbook OPEX', () => {
    const result = computeCost({ dbSizeGb: 1003.4833, growthRate: 0.3 }, workbook);
    expect(result.grownSizeGb).toBeCloseTo(1304.52829, 5);
    expect(result.fixedCosts.total).toBeCloseTo(1245.896, 6);
    expect(result.variableCosts.total).toBeCloseTo(18156.42474022, 5);
    expect(result.contingency).toBeCloseTo(1815.642474022, 5);
    expect(result.snowflakeCredits.creditsPerMonth).toBe(500);
    expect(result.opex).toBeCloseTo(44617.963214242, 5);
  });

  it('HFNQ: an own growth rate above the floor (87%) is used as-is', () => {
    const result = computeCost({ dbSizeGb: 303.66963, growthRate: 0.87 }, workbook);
    expect(result.inputs.effectiveGrowthRate).toBe(0.87);
    expect(result.grownSizeGb).toBeCloseTo(567.8622081, 5);
    expect(result.opex).toBeCloseTo(33339.75283356938, 5);
  });

  it('a growth rate below the floor is floored', () => {
    const result = computeCost({ dbSizeGb: 100, growthRate: 0.1 }, workbook);
    expect(result.inputs.effectiveGrowthRate).toBe(0.3);
    expect(result.grownSizeGb).toBeCloseTo(130, 6);
  });
});

describe('List Price uses the gross-margin rule (ADR-0001)', () => {
  it('60% margin ⇒ price = OPEX × 2.5, ceilinged to $500', () => {
    const result = computeCost({ dbSizeGb: 1003.4833, growthRate: 0.3 }, workbook);
    // OPEX 44,617.963… × 2.5 = 111,544.91 → next $500 step
    expect(result.opex * 2.5).toBeCloseTo(111544.908, 2);
    expect(result.listPrice).toBe(112000);
  });

  it('rounds up to the next $500 step, never down', () => {
    const result = computeCost({ dbSizeGb: 500, growthRate: 0.3 }, { ...workbook, priceFloor: 0 });
    const raw = result.opex / (1 - workbook.grossMargin);
    expect(result.listPrice % 500).toBe(0);
    expect(result.listPrice).toBeGreaterThanOrEqual(raw);
    expect(result.listPrice - raw).toBeLessThan(500);
  });

  it('small Environments are floored at $30,000', () => {
    const result = computeCost({ dbSizeGb: 10, growthRate: 0 }, workbook);
    expect(result.opex / (1 - workbook.grossMargin)).toBeLessThan(30000);
    expect(result.listPrice).toBe(30000);
  });

  it('changing the margin changes the price with the same OPEX', () => {
    const at60 = computeCost({ dbSizeGb: 1000, growthRate: 0.3 }, workbook);
    const at50 = computeCost({ dbSizeGb: 1000, growthRate: 0.3 }, { ...workbook, grossMargin: 0.5 });
    expect(at50.opex).toBeCloseTo(at60.opex, 9);
    expect(at50.listPrice).toBeLessThan(at60.listPrice);
  });
});

describe('credit allocation tier boundaries (strict >, like the worksheet IF chain)', () => {
  const cases: [number, number][] = [
    [50, 200],
    [90, 200], // exactly at the threshold stays in the lower tier
    [90.000001, 250],
    [150, 250],
    [150.000001, 400],
    [200, 400],
    [200.000001, 500],
    [1500, 500],
  ];

  for (const [grownGb, credits] of cases) {
    it(`grown size ${grownGb} GB ⇒ ${credits} credits/month`, () => {
      expect(creditsForGrownSize(grownGb, workbook.creditTiers)).toBe(credits);
    });
  }

  it('tier boundaries flow through computeCost on grown size', () => {
    // 100 GB at the 30% floor grows to exactly 130 GB ⇒ tier 2.
    const result = computeCost({ dbSizeGb: 100, growthRate: 0 }, workbook);
    expect(result.snowflakeCredits.creditsPerMonth).toBe(250);
  });
});

describe('Multi-Year Projection', () => {
  it('growth schedule: year 1 uses the own rate, later years the floor', () => {
    const { years } = projectMultiYear({ dbSizeGb: 100, growthRate: 0.87 }, 5, workbook);
    expect(years.map((y) => y.year)).toEqual([1, 2, 3, 4, 5]);
    expect(years[0].projectedSizeGb).toBeCloseTo(100 * 1.87, 9);
    for (let k = 1; k < years.length; k++) {
      expect(years[k].projectedSizeGb).toBeCloseTo(years[k - 1].projectedSizeGb * 1.3, 9);
    }
  });

  it('a below-floor own rate is floored in year 1 too', () => {
    const { years } = projectMultiYear({ dbSizeGb: 100, growthRate: 0.1 }, 2, workbook);
    expect(years[0].projectedSizeGb).toBeCloseTo(130, 9);
    expect(years[1].projectedSizeGb).toBeCloseTo(169, 9);
  });

  it('a high-growth ramp (ratio > 1) never compounds: later years grow by the floor only', () => {
    // PKNM-style: 33.84 MB database with a 98.24 ratio.
    const { years } = projectMultiYear({ dbSizeGb: 0.03384, growthRate: 98.24 }, 5, workbook);
    expect(years[0].projectedSizeGb).toBeCloseTo(0.03384 * 99.24, 9);
    expect(years[4].projectedSizeGb).toBeCloseTo(years[0].projectedSizeGb * 1.3 ** 4, 9);
    // Sane later years: still a small database, priced at the floor.
    expect(years[4].projectedSizeGb).toBeLessThan(10);
    expect(years[4].listPrice).toBe(workbook.priceFloor);
  });

  it('year 1 matches the single-year quote for the same inputs', () => {
    const inputs = { dbSizeGb: 1003.4833, growthRate: 0.3 };
    const single = computeCost(inputs, workbook);
    const { years } = projectMultiYear(inputs, 3, workbook);
    expect(years[0].projectedSizeGb).toBeCloseTo(single.grownSizeGb, 9);
    expect(years[0].listPrice).toBe(single.listPrice);
    expect(years[0].opex).toBeCloseTo(single.opex, 9);
  });

  it('each year is a full cost-model run: credit-tier and price-floor crossings reprice', () => {
    // 30 GB at the floor: 39 → 50.7 → 65.9 → 85.7 → 111.4 GB across five years.
    const { years, totalListPrice } = projectMultiYear({ dbSizeGb: 30, growthRate: 0.3 }, 5, workbook);

    // Years 1–4 stay under the 90 GB credit tier; year 5 crosses into 250 credits/month.
    expect(years.slice(0, 4).map((y) => y.creditsPerMonth)).toEqual([200, 200, 200, 200]);
    expect(years[4].creditsPerMonth).toBe(250);

    // Early years sit on the $30K price floor; by year 5 the model prices above it.
    expect(years[0].listPrice).toBe(workbook.priceFloor);
    expect(years[4].listPrice).toBeGreaterThan(workbook.priceFloor);
    // And the year-5 price is exactly the engine's output for that grown size, not an escalation.
    expect(years[4].listPrice).toBe(
      Math.max(
        Math.ceil(years[4].opex / (1 - workbook.grossMargin) / 500) * 500,
        workbook.priceFloor,
      ),
    );

    expect(totalListPrice).toBe(years.reduce((sum, y) => sum + y.listPrice, 0));
  });

  it('prices come from re-running the model, never from compounding the price', () => {
    // If prices were compounded by the growth rate, year 2 would be year 1 × 1.3.
    // OPEX has a fixed component, so the real year-2 price must be lower than that.
    const { years } = projectMultiYear({ dbSizeGb: 1000, growthRate: 0.3 }, 2, workbook);
    expect(years[1].listPrice).toBeLessThan(years[0].listPrice * 1.3);
    expect(years[1].listPrice).toBeGreaterThan(years[0].listPrice);
  });
});
