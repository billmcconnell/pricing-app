import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';

type RowIssue = { line: number; identifier: string | null; message: string };

type SpaceusedDiff = {
  created: { identifier: string; companyCode: string; dbSizeGb: number }[];
  updated: { identifier: string; oldDbSizeGb: number; newDbSizeGb: number }[];
  unchangedCount: number;
  missing: string[];
};

type GrowthRateDiff = {
  attached: { identifier: string; growthRate: number }[];
  updated: { identifier: string; oldGrowthRate: number; newGrowthRate: number }[];
  unchangedCount: number;
  unknownIdentifiers: string[];
};

type AcvDiff = {
  acvSet: { companyCode: string; oldAcv: number | null; newAcv: number }[];
  customersCreated: string[];
  unchangedCount: number;
};

type AccountNamesDiff = {
  namesSet: { companyCode: string; oldAccountName: string | null; accountName: string }[];
  customersCreated: string[];
  unchangedCount: number;
};

type ImportResponse<D> = {
  errors?: RowIssue[];
  warnings: string[];
  rowCount?: number;
  diff?: D;
  committed: boolean;
  error?: string;
};

type CustomerList = {
  imports: {
    spaceused: { importedAt: string; rowCount: number } | null;
    accountNames: { importedAt: string; rowCount: number } | null;
    growthRate: { importedAt: string; rowCount: number } | null;
    acv: { importedAt: string; rowCount: number } | null;
  };
  growthFloor: number;
  customers: {
    companyCode: string;
    accountName: string | null;
    acv: number | null;
    environments: {
      identifier: string;
      dbSizeGb: number;
      missingFromLastImport: boolean;
      growthRate: number | null;
      effectiveGrowthRate: number;
      growthDefaulted: boolean;
    }[];
  }[];
};

const STALE_AFTER_DAYS = 30;

function gb(n: number) {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} GB`;
}

function pct(ratio: number) {
  return `${(ratio * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
}

function usd(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function FeedStatus({ label, imported }: { label: string; imported: { importedAt: string; rowCount: number } | null }) {
  if (!imported) {
    return (
      <p>
        {label}: <strong>never imported</strong>
      </p>
    );
  }
  const when = new Date(imported.importedAt);
  const ageDays = (Date.now() - when.getTime()) / (24 * 60 * 60 * 1000);
  return (
    <p>
      {label}: last imported {when.toLocaleString()} ({imported.rowCount} rows)
      {ageDays > STALE_AFTER_DAYS && (
        <strong role="alert"> — stale: over {STALE_AFTER_DAYS} days old</strong>
      )}
    </p>
  );
}

function UploadCard<D>({
  title,
  feed,
  renderDiff,
  onCommitted,
}: {
  title: string;
  feed: string;
  renderDiff: (diff: D) => ReactNode;
  onCommitted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResponse<D> | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function send(mode: 'preview' | 'commit', target: File) {
    setBusy(true);
    const form = new FormData();
    form.append('file', target);
    const res = await fetch(`/api/imports/${feed}/${mode}`, { method: 'POST', body: form });
    const body = (await res.json()) as ImportResponse<D>;
    setResult(body);
    setBusy(false);
    if (body.committed) {
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      onCommitted();
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setResult(null);
    if (picked) void send('preview', picked);
  }

  return (
    <section>
      <h2>{title}</h2>
      <input ref={fileInput} type="file" accept=".csv,.xlsx" onChange={onPick} disabled={busy} />
      {result?.error && <p role="alert">{result.error}</p>}
      {result?.errors && result.errors.length > 0 && (
        <div role="alert">
          <p>Rejected — fix these rows and re-upload (nothing was imported):</p>
          <ul>
            {result.errors.map((e) => (
              <li key={e.line}>
                line {e.line} {e.identifier ? `(${e.identifier})` : ''}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result?.warnings?.map((w) => <p key={w}>⚠ {w}</p>)}
      {result?.diff && !result.committed && (
        <>
          {renderDiff(result.diff)}
          <button disabled={busy || !file} onClick={() => file && void send('commit', file)}>
            Confirm import
          </button>
        </>
      )}
      {result?.committed && <p>Imported {result.rowCount} rows.</p>}
    </section>
  );
}

export function Imports() {
  const [list, setList] = useState<CustomerList | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch('/api/customers')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CustomerList>;
      })
      .then(setList)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <section>
      <h1>Imports</h1>

      <UploadCard<SpaceusedDiff>
        title="DB sizes (spaceused feed)"
        feed="spaceused"
        onCommitted={refresh}
        renderDiff={(diff) => (
          <ul>
            <li>{diff.created.length} Environments will be created</li>
            <li>
              {diff.updated.length} Environments will be updated
              {diff.updated.length > 0 && (
                <ul>
                  {diff.updated.slice(0, 20).map((u) => (
                    <li key={u.identifier}>
                      {u.identifier}: {gb(u.oldDbSizeGb)} → {gb(u.newDbSizeGb)}
                    </li>
                  ))}
                  {diff.updated.length > 20 && <li>… and {diff.updated.length - 20} more</li>}
                </ul>
              )}
            </li>
            <li>{diff.unchangedCount} unchanged</li>
            {diff.missing.length > 0 && (
              <li>
                {diff.missing.length} Environments are missing from this feed and will be flagged
                (not deleted): {diff.missing.join(', ')}
              </li>
            )}
          </ul>
        )}
      />

      <UploadCard<GrowthRateDiff>
        title="Growth Rates"
        feed="growth-rate"
        onCommitted={refresh}
        renderDiff={(diff) => (
          <ul>
            <li>{diff.attached.length} Environments will get a Growth Rate</li>
            <li>
              {diff.updated.length} Environments will change
              {diff.updated.length > 0 && (
                <ul>
                  {diff.updated.slice(0, 20).map((u) => (
                    <li key={u.identifier}>
                      {u.identifier}: {pct(u.oldGrowthRate)} → {pct(u.newGrowthRate)}
                    </li>
                  ))}
                  {diff.updated.length > 20 && <li>… and {diff.updated.length - 20} more</li>}
                </ul>
              )}
            </li>
            <li>{diff.unchangedCount} unchanged</li>
            {diff.unknownIdentifiers.length > 0 && (
              <li>
                {diff.unknownIdentifiers.length} rows reference unknown Environments and will be
                skipped: {diff.unknownIdentifiers.join(', ')}
              </li>
            )}
          </ul>
        )}
      />

      <UploadCard<AcvDiff>
        title="ACV (Salesforce export)"
        feed="acv"
        onCommitted={refresh}
        renderDiff={(diff) => (
          <ul>
            <li>{diff.acvSet.length} Customers will get a new or changed ACV</li>
            <li>{diff.customersCreated.length} Customers will be created (no Environment yet)</li>
            <li>{diff.unchangedCount} unchanged</li>
          </ul>
        )}
      />

      <UploadCard<AccountNamesDiff>
        title="Account names (Company Code cheat sheet)"
        feed="account-names"
        onCommitted={refresh}
        renderDiff={(diff) => (
          <ul>
            <li>{diff.namesSet.length} Customer names will be set or changed</li>
            <li>{diff.customersCreated.length} Customers will be created (no Environment yet)</li>
            <li>{diff.unchangedCount} unchanged</li>
          </ul>
        )}
      />

      <h2>Customers &amp; Environments</h2>
      {error && <p role="alert">{error}</p>}
      {!list && !error && <p>Loading…</p>}
      {list && (
        <>
          <FeedStatus label="DB sizes" imported={list.imports.spaceused} />
          <FeedStatus label="Growth Rates" imported={list.imports.growthRate} />
          <FeedStatus label="ACV" imported={list.imports.acv} />
          <FeedStatus label="Account names" imported={list.imports.accountNames} />
          <p>Growth floor: {pct(list.growthFloor)} (applied at read time)</p>
          <table>
            <thead>
              <tr>
                <th>Company Code</th>
                <th>Account Name</th>
                <th>ACV</th>
                <th>Environment</th>
                <th>SaaS DB Size</th>
                <th>Growth Rate</th>
                <th>Effective Growth</th>
              </tr>
            </thead>
            <tbody>
              {list.customers.flatMap((c) =>
                c.environments.length === 0 ? (
                  <tr key={c.companyCode}>
                    <td>{c.companyCode}</td>
                    <td>{c.accountName ?? '—'}</td>
                    <td className="num">{c.acv === null ? '—' : usd(c.acv)}</td>
                    <td className="code">
                      <em>no Environment (unpriceable)</em>
                    </td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                ) : (
                  c.environments.map((e) => (
                    <tr key={e.identifier}>
                      <td>{c.companyCode}</td>
                      <td>{c.accountName ?? '—'}</td>
                      <td className="num">{c.acv === null ? '—' : usd(c.acv)}</td>
                      <td className="code">
                        {e.identifier}
                        {e.missingFromLastImport && <strong> ⚠ missing from last import</strong>}
                      </td>
                      <td className="num">{gb(e.dbSizeGb)}</td>
                      <td className="num">{e.growthRate === null ? <em>none imported</em> : pct(e.growthRate)}</td>
                      <td className="num">
                        {pct(e.effectiveGrowthRate)}
                        {e.growthDefaulted && <em> (defaulted to floor)</em>}
                      </td>
                    </tr>
                  ))
                ),
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
