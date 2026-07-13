import { useCallback, useEffect, useState } from 'react';

type Assumption = {
  key: string;
  value: number;
  label: string;
  category: 'unit-cost' | 'behavioral' | 'commercial';
  unit: string | null;
};

type Change = {
  id: number;
  key: string;
  label: string;
  oldValue: number;
  newValue: number;
  changedBy: string;
  changedAt: string;
};

const GROUPS: { category: Assumption['category']; title: string }[] = [
  { category: 'unit-cost', title: 'Unit costs' },
  { category: 'behavioral', title: 'Behavioral assumptions' },
  { category: 'commercial', title: 'Commercial policy' },
];

function AssumptionRow({
  assumption,
  onSaved,
  onError,
}: {
  assumption: Assumption;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState(String(assumption.value));
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(String(assumption.value)), [assumption.value]);

  async function save() {
    const value = Number(draft);
    if (!Number.isFinite(value)) {
      onError(`${assumption.label}: not a number`);
      return;
    }
    setBusy(true);
    onError(null);
    const res = await fetch(`/api/assumptions/${assumption.key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      onError(`${assumption.label}: ${body?.error ?? `HTTP ${res.status}`}`);
      return;
    }
    onSaved();
  }

  const dirty = Number(draft) !== assumption.value;
  return (
    <tr>
      <td>{assumption.label}</td>
      <td>
        <input
          aria-label={assumption.label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
        />{' '}
        {assumption.unit ?? ''}
      </td>
      <td>
        <button onClick={() => void save()} disabled={busy || !dirty}>
          Save
        </button>
      </td>
    </tr>
  );
}

export function Assumptions() {
  const [assumptions, setAssumptions] = useState<Assumption[] | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([
      fetch('/api/assumptions').then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Assumption[]>;
      }),
      fetch('/api/assumptions/changes').then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Change[]>;
      }),
    ])
      .then(([a, c]) => {
        setAssumptions(a);
        setChanges(c);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(refresh, [refresh]);

  if (!assumptions || !changes) return error ? <p role="alert">{error}</p> : <p>Loading…</p>;

  return (
    <section>
      <h1>Assumptions</h1>
      <p>
        Every constant the cost model depends on. Edits take effect on the next quote — quotes are
        never stored, so there is nothing to recompute.
      </p>
      {error && <p role="alert">{error}</p>}

      {GROUPS.map(({ category, title }) => (
        <div key={category}>
          <h2>{title}</h2>
          <table>
            <thead>
              <tr>
                <th>Assumption</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assumptions
                .filter((a) => a.category === category)
                .map((a) => (
                  <AssumptionRow key={a.key} assumption={a} onSaved={refresh} onError={setError} />
                ))}
            </tbody>
          </table>
        </div>
      ))}

      <h2>Change log</h2>
      {changes.length === 0 && <p>No changes yet.</p>}
      {changes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Assumption</th>
              <th>Change</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.changedAt).toLocaleString()}</td>
                <td>{c.label}</td>
                <td className="num">
                  {c.oldValue} → {c.newValue}
                </td>
                <td>{c.changedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
