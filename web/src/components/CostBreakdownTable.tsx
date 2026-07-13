export type CostBreakdown = {
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

export const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function CostBreakdownTable({ breakdown }: { breakdown: CostBreakdown }) {
  return (
    <table>
      <tbody>
        <tr>
          <th colSpan={2}>Fixed costs</th>
        </tr>
        <tr><td>AWS DMS (rep instance overhead)</td><td>{usd(breakdown.fixedCosts.dms)}</td></tr>
        <tr><td>Snowflake DATALOAD alerts</td><td>{usd(breakdown.fixedCosts.dataloadAlerts)}</td></tr>
        <tr><td><strong>Fixed costs total</strong></td><td>{usd(breakdown.fixedCosts.total)}</td></tr>
        <tr>
          <th colSpan={2}>Variable costs</th>
        </tr>
        <tr><td>AWS data transfer (SQL→DMS)</td><td>{usd(breakdown.variableCosts.sqlToDmsTransfer)}</td></tr>
        <tr><td>AWS data transfer (DMS→S3)</td><td>{usd(breakdown.variableCosts.dmsToS3Transfer)}</td></tr>
        <tr><td>AWS SQS</td><td>{usd(breakdown.variableCosts.sqs)}</td></tr>
        <tr><td>AWS S3 storage</td><td>{usd(breakdown.variableCosts.s3Storage)}</td></tr>
        <tr><td>AWS S3 data transfer</td><td>{usd(breakdown.variableCosts.s3DataTransfer)}</td></tr>
        <tr><td>Snowflake storage</td><td>{usd(breakdown.variableCosts.snowflakeStorage)}</td></tr>
        <tr><td>Snowflake Snowpipe</td><td>{usd(breakdown.variableCosts.snowpipe)}</td></tr>
        <tr><td>Snowflake serverless tasks</td><td>{usd(breakdown.variableCosts.serverlessTasks)}</td></tr>
        <tr><td><strong>Variable costs total</strong></td><td>{usd(breakdown.variableCosts.total)}</td></tr>
        <tr>
          <th colSpan={2}>Other</th>
        </tr>
        <tr><td>Contingency</td><td>{usd(breakdown.contingency)}</td></tr>
        <tr>
          <td>Snowflake credits ({breakdown.snowflakeCredits.creditsPerMonth}/month)</td>
          <td>{usd(breakdown.snowflakeCredits.cost)}</td>
        </tr>
        <tr><td><strong>OPEX</strong></td><td><strong>{usd(breakdown.opex)}</strong></td></tr>
      </tbody>
    </table>
  );
}
