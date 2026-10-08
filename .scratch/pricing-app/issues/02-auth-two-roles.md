# 02 — Auth + two roles

Status: done

## What to build

Email/password authentication with exactly two roles, per GLOSSARY.md: **Sales** (sees quotes, never OPEX/margin/contingency) and **Admin** (owns the cost model and imports). Login screen, session handling, role-based route guards on both API and UI. A seeded Admin user so the app is usable immediately after setup; Admin can create further users of either role.

## Acceptance criteria

- [x] Unauthenticated requests to any app endpoint are rejected / redirected to login
- [x] A Sales user receives 403 on admin-only API endpoints and never sees admin navigation in the UI
- [x] An Admin user can create, disable, and reset the password of users
- [x] Tests cover the role boundary (Sales blocked from admin surface, Admin allowed)

## Blocked by

- 01-walking-skeleton.md

## Comments

Implemented 2026-07-12. Decisions made along the way:

- **Sessions**: DB-backed (`sessions` table), opaque token in an httpOnly `SameSite=Lax` cookie, 7-day TTL. Disabling a user or resetting their password revokes all their sessions immediately.
- **Password hashing**: scrypt via `node:crypto` — no native-dependency hashing library needed.
- **Seeded admin**: `admin@example.com` / `change-me`, overridable with `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars; only seeded when the users table is empty. Change the password after first login (or set the env vars before first boot).
- **`/api/health` stays public** for deployment probes (issue 13); it exposes only the app name. Everything else, including `/api/auth/me`, requires a session.
- An admin cannot disable their own account (lockout guard).
- API: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, and admin-only `GET/POST /api/users`, `PATCH /api/users/:id` (disable/enable, password reset).
- UI: react-router added; `/login`, role-aware nav (admin sees Users), `/admin/users` guarded client-side on top of the API 403s.
