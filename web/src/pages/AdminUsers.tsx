import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth, type AuthUser } from '../auth.js';

export function AdminUsers() {
  const { user: me } = useAuth();
  const [userList, setUserList] = useState<AuthUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'sales' | 'admin'>('sales');

  const refresh = useCallback(() => {
    fetch('/api/users')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AuthUser[]>;
      })
      .then(setUserList)
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(refresh, [refresh]);

  async function patchUser(id: number, body: { disabled?: boolean; password?: string }) {
    setError(null);
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? `HTTP ${res.status}`);
      return;
    }
    refresh();
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? `HTTP ${res.status}`);
      return;
    }
    setEmail('');
    setPassword('');
    setRole('sales');
    refresh();
  }

  function onResetPassword(id: number, userEmail: string) {
    const next = window.prompt(`New password for ${userEmail}:`);
    if (next) void patchUser(id, { password: next });
  }

  if (error && !userList) return <p role="alert">{error}</p>;
  if (!userList) return <p>Loading…</p>;

  return (
    <section>
      <h1>Users</h1>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {userList.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.disabled ? 'disabled' : 'active'}</td>
              <td>
                <button onClick={() => onResetPassword(u.id, u.email)}>Reset password</button>
                {u.id !== me?.id && (
                  <button onClick={() => void patchUser(u.id, { disabled: !u.disabled })}>
                    {u.disabled ? 'Enable' : 'Disable'}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Create user</h2>
      <form onSubmit={onCreate}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value as 'sales' | 'admin')}>
            <option value="sales">Sales</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit">Create</button>
      </form>
    </section>
  );
}
