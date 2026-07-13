// Plain-text quote summary — the artifact Sales pastes into email or Salesforce.
// Built only from Sales-safe fields: never OPEX, margin, or cost internals,
// regardless of the viewer's role. Refresh Rate / Alternative Destination lines
// are added when the add-ons ship (issue 08).

export type QuoteSummaryInput = {
  identifier: string;
  companyCode: string;
  accountName: string | null;
  dbSizeGb: number;
  effectiveGrowthRate: number;
  growthDefaulted: boolean;
  listPrice: number;
  projection: {
    years: { year: number; projectedSizeGb: number; listPrice: number }[];
    totalListPrice: number;
  };
  quotedAt: string;
};

const gb = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} GB`;
const usd = (n: number) => `USD ${n.toLocaleString('en-US')}`;
const pct = (ratio: number) =>
  `${(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

export function buildQuoteSummary(quote: QuoteSummaryInput): string {
  const date = quote.quotedAt.slice(0, 10);
  const customer = quote.accountName
    ? `${quote.companyCode} — ${quote.accountName}`
    : quote.companyCode;
  const growth = `${pct(quote.effectiveGrowthRate)}/yr${quote.growthDefaulted ? ' (standard rate)' : ''}`;

  const years = quote.projection.years;
  const sizeColumn = years.map((y) => gb(y.projectedSizeGb));
  const sizeWidth = Math.max(...sizeColumn.map((s) => s.length));
  const yearLines = years.map(
    (y, i) => `  Year ${y.year}:  ${sizeColumn[i].padStart(sizeWidth)}   ${usd(y.listPrice)} per year`,
  );

  return [
    `DATA LAKE QUOTE — ${date}`,
    '',
    `Customer:     ${customer}`,
    `Environment:  ${quote.identifier}`,
    `IMOS DB Size: ${gb(quote.dbSizeGb)} (Growth Rate ${growth})`,
    '',
    `Year-1 List Price: ${usd(quote.listPrice)} per year`,
    '',
    `Multi-Year Projection (${years.length} year${years.length === 1 ? '' : 's'}, projected database size and that year's price):`,
    ...yearLines,
    `  Total (${years.length} year${years.length === 1 ? '' : 's'}): ${usd(quote.projection.totalListPrice)}`,
    '',
    `All prices in USD. Quoted ${date} from current data; quotes are not stored.`,
  ].join('\n');
}
