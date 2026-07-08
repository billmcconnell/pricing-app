import { useEffect, useState } from 'react';

type Health = { status: string; appName: string | null };

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Health>;
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p>Backend unreachable: {error}</p>;
  if (!health) return <p>Loading…</p>;

  return (
    <main>
      <h1>{health.appName}</h1>
      <p>
        Server status: <strong>{health.status}</strong>
      </p>
    </main>
  );
}
