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
  stubFetch(salesUser);
  renderApp();
  expect(await screen.findByRole('heading', { name: 'Data Lake Pricing' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Quotes' })).toBeDefined();
  expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Cost Model' })).toBeNull();
});

it('a Sales user visiting an admin route is sent back home', async () => {
  stubFetch(salesUser);
  renderApp('/admin/users');
  expect(await screen.findByRole('heading', { name: 'Data Lake Pricing' })).toBeDefined();
  expect(screen.queryByRole('heading', { name: 'Users' })).toBeNull();
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
