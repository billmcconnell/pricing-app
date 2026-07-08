# SQLite over Postgres

The house stack (established in Pennywise) is Node 22 + TS, pnpm, Fastify + Drizzle, Vite + React with Postgres — this app keeps the toolchain but uses SQLite. The dataset is a few hundred rows per import feed, single-writer, internally hosted; SQLite makes deployment and backup a single file with zero database operations. Drizzle keeps a later move to Postgres cheap if the app ever grows multi-writer needs.
