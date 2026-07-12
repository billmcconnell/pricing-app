import { useState, type FormEvent } from 'react';

type CostBreakdown = {
  inputs: { dbSizeGb: number; growthRate: number; effectiveGrowthRate: number };
  grownSizeGb: number;
  fixedCosts: { dms: number; dataloadAlerts: number; total: number };
  variableCosts: {
    sqlToDmsTransfer: number;
    dmsToS3Transfer: number;
    sqs: number;
    s3Storage: number;
    s3DataTransfer: number;
    snowflakeStorage: number;
    snowpipe: number;
    serverlessTasks: number;
    total: number;
  };
  contingency: number;
  snowflakeCredits: { creditsPerMonth: number; cost: number };
  opex: number;
  grossMargin: number;
  listPrice: number;
};

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

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
          <table>
            <tbody>
              <tr>
                <th colSpan={2}>Fixed costs</th>
              </tr>
              <tr><td>AWS DMS (rep instance overhead)</td><td>{usd(result.fixedCosts.dms)}</td></tr>
              <tr><td>Snowflake DATALOAD alerts</td><td>{usd(result.fixedCosts.dataloadAlerts)}</td></tr>
              <tr><td><strong>Fixed costs total</strong></td><td>{usd(result.fixedCosts.total)}</td></tr>
              <tr>
                <th colSpan={2}>Variable costs</th>
              </tr>
              <tr><td>AWS data transfer (SQL→DMS)</td><td>{usd(result.variableCosts.sqlToDmsTransfer)}</td></tr>
              <tr><td>AWS data transfer (DMS→S3)</td><td>{usd(result.variableCosts.dmsToS3Transfer)}</td></tr>
              <tr><td>AWS SQS</td><td>{usd(result.variableCosts.sqs)}</td></tr>
              <tr><td>AWS S3 storage</td><td>{usd(result.variableCosts.s3Storage)}</td></tr>
              <tr><td>AWS S3 data transfer</td><td>{usd(result.variableCosts.s3DataTransfer)}</td></tr>
              <tr><td>Snowflake storage</td><td>{usd(result.variableCosts.snowflakeStorage)}</td></tr>
              <tr><td>Snowflake Snowpipe</td><td>{usd(result.variableCosts.snowpipe)}</td></tr>
              <tr><td>Snowflake serverless tasks</td><td>{usd(result.variableCosts.serverlessTasks)}</td></tr>
              <tr><td><strong>Variable costs total</strong></td><td>{usd(result.variableCosts.total)}</td></tr>
              <tr>
                <th colSpan={2}>Other</th>
              </tr>
              <tr><td>Contingency</td><td>{usd(result.contingency)}</td></tr>
              <tr>
                <td>Snowflake credits ({result.snowflakeCredits.creditsPerMonth}/month)</td>
                <td>{usd(result.snowflakeCredits.cost)}</td>
              </tr>
              <tr><td><strong>OPEX</strong></td><td><strong>{usd(result.opex)}</strong></td></tr>
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
