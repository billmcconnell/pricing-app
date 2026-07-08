# 02 — Auth + two roles

Status: ready-for-agent

## What to build

Email/password authentication with exactly two roles, per CONTEXT.md: **Sales** (sees quotes, never OPEX/margin/contingency) and **Admin** (owns the cost model and imports). Login screen, session handling, role-based route guards on both API and UI. A seeded Admin user so the app is usable immediately after setup; Admin can create further users of either role.

## Acceptance criteria

- [ ] Unauthenticated requests to any app endpoint are rejected / redirected to login
- [ ] A Sales user receives 403 on admin-only API endpoints and never sees admin navigation in the UI
- [ ] An Admin user can create, disable, and reset the password of users
- [ ] Tests cover the role boundary (Sales blocked from admin surface, Admin allowed)

## Blocked by

- 01-walking-skeleton.md
