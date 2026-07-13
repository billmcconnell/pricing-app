import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.js';
import { AdminUsers } from './pages/AdminUsers.js';
import { Assumptions } from './pages/Assumptions.js';
import { CostModel } from './pages/CostModel.js';
import { Home } from './pages/Home.js';
import { Imports } from './pages/Imports.js';
import { Login } from './pages/Login.js';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Layout() {
  const { user, logout } = useAuth();
  return (
    <>
      <nav>
        <Link to="/">Quotes</Link>
        {user?.role === 'admin' && <Link to="/admin/imports">Imports</Link>}
        {user?.role === 'admin' && <Link to="/admin/cost-model">Cost Model</Link>}
        {user?.role === 'admin' && <Link to="/admin/assumptions">Assumptions</Link>}
        {user?.role === 'admin' && <Link to="/admin/users">Users</Link>}
        <span>
          {user?.email} <button onClick={() => void logout()}>Sign out</button>
        </span>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Home />} />
        <Route
          path="/admin/imports"
          element={
            <RequireAdmin>
              <Imports />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/cost-model"
          element={
            <RequireAdmin>
              <CostModel />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/assumptions"
          element={
            <RequireAdmin>
              <Assumptions />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAdmin>
              <AdminUsers />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
