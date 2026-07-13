import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App.js';
import { AuthProvider, type AuthUser } from './auth.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const health = { status: 'ok', appName: 'Data Lake Pricing' };

function stubFetch(me: AuthUser | null, extra: Record<string, unknown> = {}) {
  const routes: Record<string, { status: number; body: unknown }> = {
    '/api/auth/me': me ? { status: 200, body: me } : { status: 401, body: { error: 'unauthorized' } },
    '/api/health': { status: 200, body: health },
    ...Object.fromEntries(
      Object.entries(extra).map(([url, body]) => [url, { status: 200, body }]),
    ),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const route = routes[url];
      if (!route) return Promise.reject(new Error(`unmocked fetch: ${url}`));
      return Promise.resolve({
        ok: route.status < 400,
        status: route.status,
        json: () => Promise.resolve(route.body),
      });
    }),
  );
}

function renderApp(path = '/') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
}

const salesUser: AuthUser = { id: 2, email: 'sales@example.com', role: 'sales', disabled: false };
const adminUser: AuthUser = { id: 1, email: 'admin@example.com', role: 'admin', disabled: false };

it('shows the login screen when unauthenticated', async () => {
  stubFetch(null);
  renderApp();
  expect(await screen.findByRole('button', { name: 'Sign in' })).toBeDefined();
});

it('a Sales user sees quotes but no admin navigation', async () => {
  stubFetch(salesUser, { '/api/quote/customers': [] });
  renderApp();
  expect(await screen.findByRole('heading', { name: 'Quotes' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Quotes' })).toBeDefined();
  expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Cost Model' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Imports' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Assumptions' })).toBeNull();
});

it('the Assumptions page shows grouped editable values and the change log, and saves edits', async () => {
  stubFetch(adminUser, {
    '/api/assumptions': [
      { key: 'snowflake_credit_price', value: 3.9, label: 'Snowflake credit price (EU list price)', category: 'unit-cost', unit: '$/credit' },
      { key: 'contingency_rate', value: 0.1, label: 'Contingency on variable costs', category: 'behavioral', unit: 'ratio' },
      { key: 'gross_margin', value: 0.6, label: 'Gross margin: List Price = OPEX ÷ (1 − margin) (ADR-0001)', category: 'commercial', unit: 'ratio' },
    ],
    '/api/assumptions/changes': [
      {
        id: 1,
        key: 'gross_margin',
        label: 'Gross margin: List Price = OPEX ÷ (1 − margin) (ADR-0001)',
        oldValue: 0.6,
        newValue: 0.55,
        changedBy: 'admin@example.com',
        changedAt: '2026-07-13T10:00:00.000Z',
      },
    ],
    '/api/assumptions/gross_margin': { key: 'gross_margin', value: 0.55 },
  });
  renderApp('/admin/assumptions');

  expect(await screen.findByRole('heading', { name: 'Unit costs' })).toBeDefined();
  expect(screen.getByRole('heading', { name: 'Behavioral assumptions' })).toBeDefined();
  expect(screen.getByRole('heading', { name: 'Commercial policy' })).toBeDefined();
  expect(screen.getByText('Snowflake credit price (EU list price)')).toBeDefined();
  expect(screen.getByText('0.6 → 0.55')).toBeDefined();
  // Nav shows the logged-in email too; the change log adds a second occurrence.
  expect(screen.getAllByText('admin@example.com')).toHaveLength(2);

  const marginInput = screen.getByRole('textbox', { name: /Gross margin/ });
  fireEvent.change(marginInput, { target: { value: '0.55' } });
  fireEvent.click(marginInput.closest('tr')!.querySelector('button')!);

  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
  await screen.findByRole('heading', { name: 'Change log' });
  expect(
    fetchMock.mock.calls.some(
      ([url, init]) =>
        url === '/api/assumptions/gross_margin' &&
        (init as RequestInit | undefined)?.method === 'PATCH' &&
        (init as RequestInit).body === JSON.stringify({ value: 0.55 }),
    ),
  ).toBe(true);
});

it('the Imports page lists Environments with staleness and missing flags', async () => {
  const staleDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  stubFetch(adminUser, {
    '/api/customers': {
      imports: {
        spaceused: { importedAt: staleDate, rowCount: 366 },
        accountNames: null,
        growthRate: null,
        acv: null,
      },
      growthFloor: 0.3,
      customers: [
        {
          companyCode: 'MOLH',
          accountName: 'Mighty-Ocelot',
          acv: 250000,
          environments: [
            {
              identifier: 'MOLH_imos_MPCC_PROD',
              dbSizeGb: 100.5,
              missingFromLastImport: false,
              growthRate: 0.45,
              effectiveGrowthRate: 0.45,
              growthDefaulted: false,
            },
            {
              identifier: 'MOLH_imos_MOLDB_prod',
              dbSizeGb: 50.25,
              missingFromLastImport: true,
              growthRate: null,
              effectiveGrowthRate: 0.3,
              growthDefaulted: true,
            },
          ],
        },
        { companyCode: 'ZZZZ', accountName: null, acv: null, environments: [] },
      ],
    },
  });
  renderApp('/admin/imports');
  expect(await screen.findByText('MOLH_imos_MPCC_PROD')).toBeDefined();
  expect(screen.getByText(/stale: over 30 days old/)).toBeDefined();
  expect(screen.getByText(/missing from last import/)).toBeDefined();
  expect(screen.getByText(/no Environment \(unpriceable\)/)).toBeDefined();
  expect(screen.getAllByText(/never imported/).length).toBeGreaterThan(0);
  expect(screen.getAllByText('45%')).toHaveLength(2); // raw and effective columns
  expect(screen.getByText(/none imported/)).toBeDefined();
  expect(screen.getByText(/\(defaulted to floor\)/)).toBeDefined();
});

it('a Sales user visiting an admin route is sent back home', async () => {
  stubFetch(salesUser, { '/api/quote/customers': [] });
  renderApp('/admin/users');
  expect(await screen.findByRole('heading', { name: 'Quotes' })).toBeDefined();
  expect(screen.queryByRole('heading', { name: 'Users' })).toBeNull();
});

const quoteCustomers = [
  {
    companyCode: 'RUMB',
    accountName: 'Radiant-Macaw',
    environments: [
      { identifier: 'RUMB', dbSizeGb: 100, growthRate: 0.4, effectiveGrowthRate: 0.4, growthDefaulted: false },
    ],
  },
  {
    companyCode: 'MOLH',
    accountName: 'Mighty-Ocelot',
    environments: [
      { identifier: 'MOLH_imos_MPCC_PROD', dbSizeGb: 171.96, growthRate: 0.3, effectiveGrowthRate: 0.3, growthDefaulted: false },
      { identifier: 'MOLH_imos_MOLDB_prod', dbSizeGb: 160.27, growthRate: 0.3, effectiveGrowthRate: 0.3, growthDefaulted: false },
    ],
  },
  { companyCode: 'ZZZZ', accountName: 'Zeta-Zebra', environments: [] },
];

const rumbQuote = {
  identifier: 'RUMB',
  companyCode: 'RUMB',
  accountName: 'Radiant-Macaw',
  dbSizeGb: 100,
  growthRate: 0.4,
  effectiveGrowthRate: 0.4,
  growthDefaulted: false,
  grownSizeGb: 140,
  listPrice: 40000,
  projection: {
    years: [
      { year: 1, projectedSizeGb: 140, listPrice: 40000 },
      { year: 2, projectedSizeGb: 182, listPrice: 43000 },
      { year: 3, projectedSizeGb: 236.6, listPrice: 47000 },
      { year: 4, projectedSizeGb: 307.58, listPrice: 52000 },
      { year: 5, projectedSizeGb: 399.85, listPrice: 58500 },
    ],
    totalListPrice: 240500,
  },
  guardrail: { acv: 500000, threshold: 0.25, thresholdAmount: 125000, triggered: false },
  quotedAt: '2026-07-13T00:00:00.000Z',
};

it('Sales finds a Customer by Account Name and gets a List Price without cost internals', async () => {
  stubFetch(salesUser, {
    '/api/quote/customers': quoteCustomers,
    '/api/quote?environment=RUMB&years=5': rumbQuote,
  });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'radiant' } });
  fireEvent.click(await screen.findByRole('button', { name: /RUMB — Radiant-Macaw/ }));
  expect(await screen.findByText(/Year-1 List Price/)).toBeDefined();
  expect(screen.getAllByText(/\$40,000/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/OPEX/)).toBeNull();
  expect(screen.queryByText(/margin/i)).toBeNull();
  expect(screen.queryByText(/contingency/i)).toBeNull();
});

it('shows the Proportionality Guardrail warning only when triggered', async () => {
  stubFetch(salesUser, {
    '/api/quote/customers': quoteCustomers,
    '/api/quote?environment=RUMB&years=5': {
      ...rumbQuote,
      guardrail: { acv: 100000, threshold: 0.25, thresholdAmount: 25000, triggered: true },
    },
  });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'RUMB' } });
  fireEvent.click(await screen.findByRole('button', { name: /RUMB — Radiant-Macaw/ }));
  expect(await screen.findByText(/Proportionality Guardrail/)).toBeDefined();
  expect(screen.getByText(/flag for judgment, not a block/)).toBeDefined();
});

it('quietly notes when ACV is unknown, and stays silent when the guardrail passes', async () => {
  stubFetch(salesUser, {
    '/api/quote/customers': quoteCustomers,
    '/api/quote?environment=RUMB&years=5': {
      ...rumbQuote,
      guardrail: { acv: null, threshold: 0.25, thresholdAmount: null, triggered: null },
    },
  });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'RUMB' } });
  fireEvent.click(await screen.findByRole('button', { name: /RUMB — Radiant-Macaw/ }));
  expect(await screen.findByText(/ACV unknown for this Customer/)).toBeDefined();
  expect(screen.queryByText(/Proportionality Guardrail:/)).toBeNull();
});

it('Copy summary puts the plain-text quote on the clipboard with visible confirmation', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  stubFetch(salesUser, {
    '/api/quote/customers': quoteCustomers,
    '/api/quote?environment=RUMB&years=5': rumbQuote,
  });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'RUMB' } });
  fireEvent.click(await screen.findByRole('button', { name: /RUMB — Radiant-Macaw/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Copy summary' }));

  expect(await screen.findByRole('status')).toBeDefined();
  expect(screen.getByText(/Copied to clipboard/)).toBeDefined();
  expect(writeText).toHaveBeenCalledOnce();
  const text = writeText.mock.calls[0][0] as string;
  expect(text).toContain('DATA LAKE QUOTE');
  expect(text).toContain('RUMB — Radiant-Macaw');
  expect(text).toContain('Year-1 List Price: USD 40,000 per year');
  expect(text).toContain('Total (5 years): USD 240,500');
  expect(text).not.toMatch(/OPEX|margin|contingency/i);
});

it('shows the Multi-Year Projection with per-year prices and the total', async () => {
  stubFetch(salesUser, {
    '/api/quote/customers': quoteCustomers,
    '/api/quote?environment=RUMB&years=5': rumbQuote,
    '/api/quote?environment=RUMB&years=3': {
      ...rumbQuote,
      projection: {
        years: rumbQuote.projection.years.slice(0, 3),
        totalListPrice: 130000,
      },
    },
  });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'RUMB' } });
  fireEvent.click(await screen.findByRole('button', { name: /RUMB — Radiant-Macaw/ }));

  expect(await screen.findByRole('heading', { name: 'Multi-Year Projection' })).toBeDefined();
  expect(screen.getByText(/\$58,500/)).toBeDefined(); // year 5
  expect(screen.getByText('Total (5 years)')).toBeDefined();
  expect(screen.getByText(/\$240,500/)).toBeDefined();

  // Changing the years input re-fetches the projection.
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } });
  expect(await screen.findByText('Total (3 years)')).toBeDefined();
  expect(screen.getByText(/\$130,000/)).toBeDefined();
  expect(screen.queryByText(/\$58,500/)).toBeNull();
});

it('a Customer with several Environments requires choosing one', async () => {
  stubFetch(salesUser, {
    '/api/quote/customers': quoteCustomers,
    '/api/quote?environment=MOLH_imos_MPCC_PROD&years=5': {
      ...rumbQuote,
      identifier: 'MOLH_imos_MPCC_PROD',
      companyCode: 'MOLH',
      accountName: 'Mighty-Ocelot',
      listPrice: 33500,
    },
  });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'MOLH' } });
  fireEvent.click(await screen.findByRole('button', { name: /MOLH — Mighty-Ocelot/ }));
  expect(await screen.findByText(/each is priced separately/)).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: /MOLH_imos_MPCC_PROD/ }));
  expect(await screen.findByText(/\$33,500/)).toBeDefined();
});

it('an unpriceable Customer shows the no-measured-Environment state, not an error', async () => {
  stubFetch(salesUser, { '/api/quote/customers': quoteCustomers });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'zeta' } });
  fireEvent.click(await screen.findByRole('button', { name: /ZZZZ.*unpriceable/ }));
  expect(await screen.findByText(/has no measured Environment yet/)).toBeDefined();
});

it('an Admin sees the cost breakdown on the same quote screen', async () => {
  stubFetch(adminUser, {
    '/api/quote/customers': quoteCustomers,
    '/api/quote?environment=RUMB&years=5': {
      ...rumbQuote,
      breakdown: {
        inputs: { dbSizeGb: 100, growthRate: 0.4, effectiveGrowthRate: 0.4 },
        grownSizeGb: 140,
        fixedCosts: { dms: 122.7, dataloadAlerts: 1123.2, total: 1245.9 },
        variableCosts: {
          sqlToDmsTransfer: 4.48,
          dmsToS3Transfer: 4.48,
          sqs: 0,
          s3Storage: 85.01,
          s3DataTransfer: 40.32,
          snowflakeStorage: 38.64,
          snowpipe: 727.27,
          serverlessTasks: 1048.32,
          total: 1948.52,
        },
        contingency: 194.85,
        snowflakeCredits: { creditsPerMonth: 250, cost: 11700 },
        opex: 15089.27,
        grossMargin: 0.6,
        listPrice: 40000,
      },
    },
  });
  renderApp();
  fireEvent.change(await screen.findByRole('searchbox'), { target: { value: 'RUMB' } });
  fireEvent.click(await screen.findByRole('button', { name: /RUMB — Radiant-Macaw/ }));
  expect(await screen.findByText(/Cost breakdown \(Admin only\)/)).toBeDefined();
  expect(screen.getByText('OPEX')).toBeDefined();
});

it('an Admin sees the admin navigation and users screen', async () => {
  stubFetch(adminUser, { '/api/users': [adminUser, salesUser] });
  renderApp('/admin/users');
  expect(await screen.findByRole('heading', { name: 'Users' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Users' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Cost Model' })).toBeDefined();
  expect(screen.getByText('sales@example.com')).toBeDefined();
});

it('the Cost Model form computes a breakdown', async () => {
  const breakdown = {
    inputs: { dbSizeGb: 150, growthRate: 0.3, effectiveGrowthRate: 0.3 },
    grownSizeGb: 195,
    fixedCosts: { dms: 122.7, dataloadAlerts: 1123.2, total: 1245.9 },
    variableCosts: {
      sqlToDmsTransfer: 6.24,
      dmsToS3Transfer: 6.24,
      sqs: 0,
      s3Storage: 118.4,
      s3DataTransfer: 56.16,
      snowflakeStorage: 53.82,
      snowpipe: 1012.99,
      serverlessTasks: 1460.16,
      total: 2714.01,
    },
    contingency: 271.4,
    snowflakeCredits: { creditsPerMonth: 250, cost: 11700 },
    opex: 15931.31,
    grossMargin: 0.6,
    listPrice: 40000,
  };
  stubFetch(adminUser, {
    '/api/cost-model/compute?dbSizeGb=150&growthRate=0.3': breakdown,
  });
  renderApp('/admin/cost-model');
  fireEvent.submit(await screen.findByRole('button', { name: 'Compute' }));
  expect(await screen.findByRole('heading', { name: /List Price: \$40,000/ })).toBeDefined();
  expect(screen.getByText('OPEX')).toBeDefined();
});
