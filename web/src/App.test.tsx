import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from './App.js';

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the app name from the health endpoint', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok', appName: 'Data Lake Pricing' }),
    }),
  );

  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Data Lake Pricing' })).toBeDefined();
  expect(screen.getByText('ok')).toBeDefined();
});

it('shows an error when the backend is unreachable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

  render(<App />);
  expect(await screen.findByText(/Backend unreachable/)).toBeDefined();
});
