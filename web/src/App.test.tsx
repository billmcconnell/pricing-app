import { cleanup, render, screen } from '@testing-library/react';
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
  expect(screen.getByText('sales@example.com')).toBeDefined();
});
