import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
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
      <header className="topbar">
        <div className="wordmark">
          Data Lake<small>Pricing</small>
        </div>
        <nav>
          <NavLink to="/">Quotes</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin/imports">Imports</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin/cost-model">Cost Model</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin/assumptions">Assumptions</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin/users">Users</NavLink>}
        </nav>
        <span className="session">
          {user?.email} <button onClick={() => void logout()}>Sign out</button>
        </span>
      </header>
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
