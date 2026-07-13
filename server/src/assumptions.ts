import { eq } from 'drizzle-orm';
import type { Db } from './db.js';
import type { CostModelAssumptions } from './costModel.js';
import { assumptions } from './schema.js';

type Seed = {
  key: string;
  value: number;
  label: string;
  category: 'unit-cost' | 'behavioral' | 'commercial';
  unit?: string;
};

// Seeded from the workbook's Pricing Worksheet current values (2026-07-08 snapshot),
// except gross_margin, which replaces the worksheet's 70% markup (ADR-0001).
export const ASSUMPTION_SEEDS: Seed[] = [
  // Unit costs
  { key: 'snowflake_credit_price', value: 3.9, label: 'Snowflake credit price (EU list price)', category: 'unit-cost', unit: '$/credit' },
  { key: 'snowflake_storage_price_tb_month', value: 23, label: 'Snowflake storage', category: 'unit-cost', unit: '$/TB/month' },
  { key: 'dms_instance_hourly', value: 0.92, label: 'DMS replication instance (dms.r5.2xlarge)', category: 'unit-cost', unit: '$/hour' },
  { key: 'dms_instance_storage_gb', value: 750, label: 'DMS instance storage (targeting 75 tasks, 10 GB per task)', category: 'unit-cost', unit: 'GB' },
  { key: 'dms_instance_storage_price_gb_month', value: 0.127, label: 'DMS instance storage price', category: 'unit-cost', unit: '$/GB/month' },
  { key: 'dms_tasks_per_instance', value: 75, label: 'DMS tasks sharing one replication instance', category: 'unit-cost', unit: 'tasks' },
  { key: 'vpc_data_transfer_price_gb', value: 0.01, label: 'VPC in-region data transfer', category: 'unit-cost', unit: '$/GB' },
  { key: 's3_storage_price_gb_month', value: 0.023, label: 'S3 storage', category: 'unit-cost', unit: '$/GB/month' },
  { key: 's3_data_transfer_price_gb', value: 0.09, label: 'S3 data transfer', category: 'unit-cost', unit: '$/GB' },
  { key: 'snowpipe_credits_per_gb', value: 1.11, label: 'Snowpipe credit consumption (eu-west-1 average)', category: 'unit-cost', unit: 'credits/GB' },
  { key: 'serverless_credits_per_gb_month', value: 0.16, label: 'Snowflake serverless tasks credit consumption', category: 'unit-cost', unit: 'credits/GB/month' },
  { key: 'dataload_warehouse_credits_month', value: 24, label: 'DATALOAD warehouse alerts (medium warehouse)', category: 'unit-cost', unit: 'credits/month' },
  // Behavioral assumptions
  { key: 'monthly_turnover_rate', value: 0.1, label: 'Database turnover per month (transactional changes)', category: 'behavioral', unit: 'ratio' },
  { key: 'contingency_rate', value: 0.1, label: 'Contingency on variable costs', category: 'behavioral', unit: 'ratio' },
  { key: 'growth_floor', value: 0.3, label: 'Growth Rate floor applied to every Environment', category: 'behavioral', unit: 'ratio' },
  // Commercial policy
  { key: 'gross_margin', value: 0.6, label: 'Gross margin: List Price = OPEX ÷ (1 − margin) (ADR-0001)', category: 'commercial', unit: 'ratio' },
  { key: 'guardrail_acv_share', value: 0.25, label: 'Proportionality Guardrail: warn when List Price exceeds this share of the Customer’s ACV (flags, never blocks)', category: 'commercial', unit: 'ratio' },
  { key: 'price_floor', value: 30000, label: 'Minimum List Price', category: 'commercial', unit: '$/year' },
  { key: 'price_rounding', value: 500, label: 'List Price rounded up to the nearest', category: 'commercial', unit: '$' },
  { key: 'credit_tier_base_credits', value: 200, label: 'Snowflake credit allocation, base tier', category: 'commercial', unit: 'credits/month' },
  { key: 'credit_tier_2_over_gb', value: 90, label: 'Credit tier 2 applies above this grown size', category: 'commercial', unit: 'GB' },
  { key: 'credit_tier_2_credits', value: 250, label: 'Snowflake credit allocation, tier 2', category: 'commercial', unit: 'credits/month' },
  { key: 'credit_tier_3_over_gb', value: 150, label: 'Credit tier 3 applies above this grown size', category: 'commercial', unit: 'GB' },
  { key: 'credit_tier_3_credits', value: 400, label: 'Snowflake credit allocation, tier 3', category: 'commercial', unit: 'credits/month' },
  { key: 'credit_tier_4_over_gb', value: 200, label: 'Credit tier 4 applies above this grown size', category: 'commercial', unit: 'GB' },
  { key: 'credit_tier_4_credits', value: 500, label: 'Snowflake credit allocation, tier 4', category: 'commercial', unit: 'credits/month' },
];

/** Read a single Assumption value not consumed by the cost model (e.g. the guardrail share). */
export function assumptionValue(db: Db, key: string): number {
  const row = db.select().from(assumptions).where(eq(assumptions.key, key)).get();
  if (!row) throw new Error(`Assumption missing from database: ${key}`);
  return row.value;
}

export function loadCostModelAssumptions(db: Db): CostModelAssumptions {
  const rows = db.select().from(assumptions).all();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const req = (key: string): number => {
    const value = byKey.get(key);
    if (value === undefined) throw new Error(`Assumption missing from database: ${key}`);
    return value;
  };

  return {
    monthlyTurnoverRate: req('monthly_turnover_rate'),
    contingencyRate: req('contingency_rate'),
    growthFloor: req('growth_floor'),
    snowflakeCreditPrice: req('snowflake_credit_price'),
    snowflakeStoragePricePerTbMonth: req('snowflake_storage_price_tb_month'),
    dmsInstanceHourly: req('dms_instance_hourly'),
    dmsInstanceStorageGb: req('dms_instance_storage_gb'),
    dmsInstanceStoragePricePerGbMonth: req('dms_instance_storage_price_gb_month'),
    dmsTasksPerInstance: req('dms_tasks_per_instance'),
    vpcDataTransferPricePerGb: req('vpc_data_transfer_price_gb'),
    s3StoragePricePerGbMonth: req('s3_storage_price_gb_month'),
    s3DataTransferPricePerGb: req('s3_data_transfer_price_gb'),
    snowpipeCreditsPerGb: req('snowpipe_credits_per_gb'),
    serverlessCreditsPerGbMonth: req('serverless_credits_per_gb_month'),
    dataloadWarehouseCreditsPerMonth: req('dataload_warehouse_credits_month'),
    grossMargin: req('gross_margin'),
    priceFloor: req('price_floor'),
    priceRounding: req('price_rounding'),
    creditTiers: [
      { overGrownGb: req('credit_tier_4_over_gb'), creditsPerMonth: req('credit_tier_4_credits') },
      { overGrownGb: req('credit_tier_3_over_gb'), creditsPerMonth: req('credit_tier_3_credits') },
      { overGrownGb: req('credit_tier_2_over_gb'), creditsPerMonth: req('credit_tier_2_credits') },
      { overGrownGb: 0, creditsPerMonth: req('credit_tier_base_credits') },
    ],
  };
}
