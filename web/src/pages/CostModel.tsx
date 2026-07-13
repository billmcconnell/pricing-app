import { useState, type FormEvent } from 'react';
import {
  CostBreakdownTable,
  usd,
  type CostBreakdown,
} from '../components/CostBreakdownTable.js';

export function CostModel() {
  const [dbSizeGb, setDbSizeGb] = useState('150');
  const [growthRate, setGrowthRate] = useState('0.3');
  const [result, setResult] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(
      `/api/cost-model/compute?dbSizeGb=${encodeURIComponent(dbSizeGb)}&growthRate=${encodeURIComponent(growthRate)}`,
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? `HTTP ${res.status}`);
      setResult(null);
      return;
    }
    setResult((await res.json()) as CostBreakdown);
  }

  return (
    <section>
      <h1>Cost Model</h1>
      <form onSubmit={onSubmit}>
        <label>
          IMOS DB Size (GB)
          <input value={dbSizeGb} onChange={(e) => setDbSizeGb(e.target.value)} required />
        </label>
        <label>
          Growth Rate (0.2 = 20%/yr)
          <input value={growthRate} onChange={(e) => setGrowthRate(e.target.value)} required />
        </label>
        <button type="submit">Compute</button>
        {error && <p role="alert">{error}</p>}
      </form>

      {result && (
        <>
          <h2>List Price: {usd(result.listPrice)} / year</h2>
          <p>
            Grown size: {result.grownSizeGb.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
            GB (effective Growth Rate {(result.inputs.effectiveGrowthRate * 100).toFixed(0)}%),
            gross margin {(result.grossMargin * 100).toFixed(0)}%
          </p>
          <CostBreakdownTable breakdown={result} />
        </>
      )}
    </section>
  );
}
