import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth.js';
import {
  CostBreakdownTable,
  usd,
  type CostBreakdown,
} from '../components/CostBreakdownTable.js';
import { buildQuoteSummary } from '../quoteSummary.js';

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
  projection: {
    years: { year: number; projectedSizeGb: number; listPrice: number }[];
    totalListPrice: number;
  };
  guardrail: {
    acv: number | null;
    threshold: number;
    thresholdAmount: number | null;
    triggered: boolean | null;
  };
  quotedAt: string;
  breakdown?: CostBreakdown;
};

function gb(n: number) {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} GB`;
}

// List Prices are always whole dollars ($500 steps) — no cents on the rate card.
function usdWhole(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
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
  const [years, setYears] = useState(5);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copySummary(q: Quote) {
    await navigator.clipboard.writeText(buildQuoteSummary(q));
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2500);
  }

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
    fetch(`/api/quote?environment=${encodeURIComponent(environment)}&years=${years}`)
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
  }, [environment, years]);

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
      <label className="customer-search">
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

      {customers.length === 0 && (
        <p className="note">
          Nothing to quote yet — no database sizes have been imported. An Admin uploads the
          DB-size feed on the Imports screen first.
        </p>
      )}

      {query.trim() !== '' && !selected && (
        <ul className="search-results">
          {matches.map((c) => (
            <li key={c.companyCode}>
              <button onClick={() => pickCustomer(c)}>
                <span className="code">{c.companyCode}</span>
                {c.accountName ? ` — ${c.accountName}` : ''}
                {c.environments.length === 0 && <em> (unpriceable)</em>}
                {c.environments.length > 1 && ` (${c.environments.length} Environments)`}
              </button>
            </li>
          ))}
          {matches.length === 0 && customers.length > 0 && <li>No matching Customers.</li>}
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
          <ul className="env-picker">
            {selected.environments.map((e) => (
              <li key={e.identifier}>
                <button onClick={() => setEnvironment(e.identifier)}>
                  <span className="code">{e.identifier}</span> ({gb(e.dbSizeGb)})
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {quote && (
        <article className="rate-card">
          <h2>
            {quote.companyCode}
            {quote.accountName ? ` — ${quote.accountName}` : ''}{' '}
            <span className="identifier">· {quote.identifier}</span>
          </h2>
          <p className="price-hero">
            <span className="price-label">Year-1 List Price</span>
            <strong>{usdWhole(quote.listPrice)}</strong>
            <span className="price-unit">/ year</span>
            <button onClick={() => void copySummary(quote)}>Copy summary</button>
            {copied && <span role="status"> Copied to clipboard.</span>}
          </p>
          <ul className="quote-inputs">
            <li>
              IMOS DB Size <span className="num">{gb(quote.dbSizeGb)}</span>
            </li>
            <li>
              Growth Rate{' '}
              <span className="num">
                {quote.growthRate === null ? (
                  <em>none imported — floor applied</em>
                ) : (
                  pct(quote.growthRate)
                )}{' '}
                (effective {pct(quote.effectiveGrowthRate)})
              </span>
            </li>
            <li>
              Grown size <span className="num">{gb(quote.grownSizeGb)}</span>
            </li>
          </ul>
          {quote.guardrail.triggered === true && (
            <p role="alert">
              <strong>Proportionality Guardrail:</strong> this List Price exceeds{' '}
              {pct(quote.guardrail.threshold)} of the Customer&apos;s ACV ({usd(quote.guardrail.acv!)}
              ). This is a flag for judgment, not a block.
            </p>
          )}
          {quote.guardrail.triggered === null && (
            <p className="note">
              <em>ACV unknown for this Customer — Proportionality Guardrail not evaluated.</em>
            </p>
          )}

          <h3>Multi-Year Projection</h3>
          <label>
            Years
            <input
              type="number"
              min={1}
              max={30}
              value={years}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 30) setYears(n);
              }}
            />
          </label>
          <table>
            <thead>
              <tr>
                <th className="num">Year</th>
                <th className="num">Projected size</th>
                <th className="num">List Price</th>
              </tr>
            </thead>
            <tbody>
              {quote.projection.years.map((y) => (
                <tr key={y.year}>
                  <td className="num">{y.year}</td>
                  <td className="num">{gb(y.projectedSizeGb)}</td>
                  <td className="num">{usdWhole(y.listPrice)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={2}>
                  <strong>Total ({quote.projection.years.length} years)</strong>
                </td>
                <td className="num">
                  <strong>{usdWhole(quote.projection.totalListPrice)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="note">
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
