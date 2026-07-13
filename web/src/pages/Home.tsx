import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth.js';
import {
  CostBreakdownTable,
  usd,
  type CostBreakdown,
} from '../components/CostBreakdownTable.js';

type QuoteEnvironment = {
  identifier: string;
  dbSizeGb: number;
  growthRate: number | null;
  effectiveGrowthRate: number;
  growthDefaulted: boolean;
};

type QuoteCustomer = {
  companyCode: string;
  accountName: string | null;
  environments: QuoteEnvironment[];
};

type Quote = {
  identifier: string;
  companyCode: string;
  accountName: string | null;
  dbSizeGb: number;
  growthRate: number | null;
  effectiveGrowthRate: number;
  growthDefaulted: boolean;
  grownSizeGb: number;
  listPrice: number;
  quotedAt: string;
  breakdown?: CostBreakdown;
};

function gb(n: number) {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} GB`;
}

function pct(ratio: number) {
  return `${(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

const MAX_RESULTS = 15;

export function Home() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<QuoteCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<QuoteCustomer | null>(null);
  const [environment, setEnvironment] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    fetch('/api/quote/customers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<QuoteCustomer[]>;
      })
      .then(setCustomers)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!environment) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/quote?environment=${encodeURIComponent(environment)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Quote>;
      })
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [environment]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!customers || q === '') return [];
    return customers
      .filter(
        (c) =>
          c.companyCode.toLowerCase().includes(q) ||
          (c.accountName ?? '').toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [customers, query]);

  function pickCustomer(customer: QuoteCustomer) {
    setSelected(customer);
    // One Environment needs no choice; several must be picked — each prices separately.
    setEnvironment(customer.environments.length === 1 ? customer.environments[0].identifier : null);
  }

  if (error) return <p role="alert">{error}</p>;
  if (!customers) return <p>Loading…</p>;

  return (
    <section>
      <h1>Quotes</h1>
      <label>
        Customer
        <input
          type="search"
          placeholder="Company Code or Account Name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
            setEnvironment(null);
          }}
        />
      </label>

      {query.trim() !== '' && !selected && (
        <ul>
          {matches.map((c) => (
            <li key={c.companyCode}>
              <button onClick={() => pickCustomer(c)}>
                {c.companyCode}
                {c.accountName ? ` — ${c.accountName}` : ''}
                {c.environments.length === 0 && <em> (unpriceable)</em>}
                {c.environments.length > 1 && ` (${c.environments.length} Environments)`}
              </button>
            </li>
          ))}
          {matches.length === 0 && <li>No matching Customers.</li>}
        </ul>
      )}

      {selected && selected.environments.length === 0 && (
        <p>
          <strong>
            {selected.companyCode}
            {selected.accountName ? ` — ${selected.accountName}` : ''}
          </strong>{' '}
          has no measured Environment yet — nothing is priceable until a database size is
          imported.
        </p>
      )}

      {selected && selected.environments.length > 1 && (
        <>
          <p>
            {selected.companyCode} has {selected.environments.length} Environments — each is
            priced separately:
          </p>
          <ul>
            {selected.environments.map((e) => (
              <li key={e.identifier}>
                <button onClick={() => setEnvironment(e.identifier)}>
                  {e.identifier} ({gb(e.dbSizeGb)})
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {quote && (
        <article>
          <h2>
            {quote.companyCode}
            {quote.accountName ? ` — ${quote.accountName}` : ''} · {quote.identifier}
          </h2>
          <p>
            Year-1 List Price: <strong>{usd(quote.listPrice)}</strong> / year
          </p>
          <ul>
            <li>IMOS DB Size: {gb(quote.dbSizeGb)}</li>
            <li>
              Growth Rate:{' '}
              {quote.growthRate === null ? (
                <em>none imported — floor applied</em>
              ) : (
                pct(quote.growthRate)
              )}{' '}
              (effective {pct(quote.effectiveGrowthRate)})
            </li>
            <li>Grown size: {gb(quote.grownSizeGb)}</li>
          </ul>
          <p>
            <em>Quotes are not saved — prices reflect current data and Assumptions.</em>
          </p>
          {user?.role === 'admin' && quote.breakdown && (
            <>
              <h3>Cost breakdown (Admin only)</h3>
              <CostBreakdownTable breakdown={quote.breakdown} />
            </>
          )}
        </article>
      )}
    </section>
  );
}
