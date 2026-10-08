# Data Lake Pricing App

Internal tool prototype for pricing a Data Lake product (a SaaS database replicated from a Cloud Provider to a Lakehouse or Datalake repository, the vendor choice is out of scope). The impetus for the Data Lake product was the need by B2B SaaS customers wanting near real-time access to their data for large-scale analytics. The operational expense and variation in the size of customers' data sets and usage patterns required a shift from the classic SaaS per-seat pricing model to a consumption-based one; a shift many SaaS companies are making as variable AI-workloads drive new and unpredictable OPEX costs for those companies.

This protoype replaces a preceding "Data Lake Pricing Dashboard" Excel workbook and the quotation rules, the cost model that derives prices, and the per-customer data that feeds it. This is an example of something I would have done at my last company if I'd had access to an AI coding harness.

- **Sales** use the quote screen: List Price, options, and multi-year totals. OPEX, margin, and contingency are never shown to them.
- **Admins** own the cost model: they edit assumptions and price floors, import data feeds, and review the change log.

Prices are derived from OPEX grossed up to a target gross margin, not marked up (see [ADR-0001](docs/adr/0001-price-by-gross-margin-not-markup.md)). The domain vocabulary (Environment, Customer, Growth Rate, List Price, etc.) is defined in [GLOSSARY.md](GLOSSARY.md).

## Stack

Node 22 + TypeScript, pnpm workspaces, Fastify + Drizzle + SQLite (better-sqlite3), Vite + React. See [ADR-0003](docs/adr/0003-sqlite-over-postgres.md) for why SQLite.

```
server/   Fastify API, cost model, importers, backup scripts
web/      Vite + React single-page app
docs/     Deployment runbook, ADRs, agent/issue-tracker docs
```

## Getting started

Requires Node >= 22 and pnpm 10 (pinned via `packageManager`; `corepack enable` will pick it up).

```sh
pnpm install
pnpm dev      # runs server and web in parallel
pnpm test     # vitest in both packages
pnpm build    # tsc for server; tsc + vite build for web
```

### Server configuration

Environment variables read by the server:

| Variable | Purpose |
|---|---|
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seeded admin account |
| `DATABASE_PATH` | SQLite file location (`/data/app.db` in production) |
| `HOST`, `PORT` | Listen address |
| `WEB_DIST` | Path to the built SPA to serve |
| `BACKUP_DIR`, `BACKUP_HOUR_UTC`, `BACKUP_RCLONE_REMOTE`, `RCLONE_CONF` | Nightly backup to Google Drive via rclone |

### Useful scripts (run from `server/`)

```sh
pnpm report:parity   # compare app output against the Excel workbook
pnpm backup          # back up the database
pnpm restore         # restore from a backup
pnpm db:generate     # generate Drizzle migrations
```

## Deployment

The app runs as a single Node process on Fly.io (API plus built SPA, SQLite on a volume) with nightly backups to Google Drive. See [docs/deploy.md](docs/deploy.md) for setup and operations.

Margin and ACV data are made up numbers but normally would be considered highly sensitive and the login page is internet-reachable, so use strong passwords and rotate the seeded admin credentials after first login to replicate a true production environment.

## Documentation

- [GLOSSARY.md](GLOSSARY.md): domain glossary
- [docs/adr/](docs/adr/): architecture and pricing decisions
- [docs/deploy.md](docs/deploy.md): deployment runbook
