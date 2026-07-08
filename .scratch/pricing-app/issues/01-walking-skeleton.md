# 01 — Walking skeleton

Status: ready-for-agent

## What to build

The end-to-end scaffold everything else plugs into: a pnpm project (Node 22 + TS) with a Fastify + Drizzle + SQLite backend and a Vite + React frontend, initialized as a git repository. One trivially real path through all layers: the React app calls a backend health endpoint that reads something from the SQLite database and renders the result. Test harness wired for both unit tests (calc/backend) and API tests, runnable with a single command. See ADR-0003 for why SQLite.

Note the Google Drive quirk from the root cc-projects CLAUDE.md: directories sync read-only; paths contain spaces.

## Acceptance criteria

- [ ] `pnpm dev` starts backend and frontend; the page renders a value that round-trips through Fastify → Drizzle → SQLite
- [ ] `pnpm test` runs a passing test suite covering the health path
- [ ] Drizzle migrations set up and applied automatically on startup
- [ ] Git repository initialized with a sensible .gitignore (SQLite file, node_modules, .DS_Store, Drive lock files)

## Blocked by

None - can start immediately
