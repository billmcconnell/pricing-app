import { describe, expect, it } from 'vitest';
import { buildQuoteSummary, type QuoteSummaryInput } from './quoteSummary.js';

const quote: QuoteSummaryInput = {
  identifier: 'MOLH_imos_MPCC_PROD',
  companyCode: 'MOLH',
  accountName: 'Mighty-Ocelot',
  dbSizeGb: 171.96,
  effectiveGrowthRate: 0.3,
  growthDefaulted: false,
  listPrice: 71500,
  projection: {
    years: [
      { year: 1, projectedSizeGb: 223.55, listPrice: 71500 },
      { year: 2, projectedSizeGb: 290.62, listPrice: 74000 },
      { year: 3, projectedSizeGb: 377.8, listPrice: 77000 },
    ],
    totalListPrice: 222500,
  },
  quotedAt: '2026-07-13T15:30:00.000Z',
};

describe('buildQuoteSummary', () => {
  const summary = buildQuoteSummary(quote);

  it('includes customer, environment, year-1 price, every projection year, total, and date', () => {
    expect(summary).toContain('MOLH — Mighty-Ocelot');
    expect(summary).toContain('MOLH_imos_MPCC_PROD');
    expect(summary).toContain('171.96 GB');
    expect(summary).toContain('Growth Rate 30%/yr');
    expect(summary).toContain('Year-1 List Price: USD 71,500 per year');
    expect(summary).toContain('Year 1:');
    expect(summary).toContain('Year 2:');
    expect(summary).toContain('Year 3:');
    expect(summary).toContain('USD 74,000');
    expect(summary).toContain('Total (3 years): USD 222,500');
    expect(summary.startsWith('DATA LAKE QUOTE — 2026-07-13')).toBe(true);
    expect(summary).toContain('Quoted 2026-07-13');
  });

  it('labels every price with USD', () => {
    // Every currency amount must be USD-prefixed — no bare $ or unlabeled numbers with commas.
    expect(summary).not.toContain('$');
    const priceLines = summary.split('\n').filter((l) => /List Price|Year \d|Total/.test(l));
    for (const line of priceLines) {
      expect(line, line).toMatch(/USD [\d,]+/);
    }
  });

  it('contains no cost internals, even when the quote object carries an Admin breakdown', () => {
    const adminQuote = {
      ...quote,
      breakdown: {
        opex: 28577.3,
        grossMargin: 0.6,
        contingency: 1520.4,
        fixedCosts: { total: 1245.9 },
        variableCosts: { total: 15204.1 },
        snowflakeCredits: { creditsPerMonth: 500, cost: 23400 },
      },
    };
    const output = buildQuoteSummary(adminQuote);
    for (const forbidden of ['OPEX', 'opex', 'margin', 'Margin', 'contingency', 'Contingency', 'credit', 'Credit', '28,577', '23,400']) {
      expect(output, forbidden).not.toContain(forbidden);
    }
    expect(output).toBe(summary); // extra fields change nothing
  });

  it('renders sanely as plain text: no markdown artifacts, aligned projection rows', () => {
    for (const artifact of ['#', '*', '|', '`', '**', '](']) {
      expect(summary, artifact).not.toContain(artifact);
    }
    // Projection size column is right-aligned: the USD part starts at the same offset.
    const yearLines = summary.split('\n').filter((l) => l.trimStart().startsWith('Year '));
    const usdOffsets = new Set(yearLines.map((l) => l.indexOf('USD')));
    expect(usdOffsets.size).toBe(1);
  });

  it('marks a defaulted Growth Rate as the standard rate and handles a nameless Customer', () => {
    const defaulted = buildQuoteSummary({
      ...quote,
      accountName: null,
      growthDefaulted: true,
    });
    expect(defaulted).toContain('Customer:     MOLH\n');
    expect(defaulted).toContain('30%/yr (standard rate)');
  });
});
