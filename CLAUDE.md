# pricing-app

Data Lake pricing app — replaces the "Data Lake Pricing Dashboard" Excel workbook (quoting, cost model, per-customer data). Read `GLOSSARY.md` for the domain glossary and `docs/adr/` for decisions before touching the model.

Stack: Node 22 + TS, pnpm, Fastify + Drizzle + SQLite, Vite + React (see ADR-0003).

## Agent skills

- **Issue tracker**: local markdown — see `docs/agents/issue-tracker.md`. Issues live in `.scratch/<feature-slug>/issues/`.
- **Triage labels**: defaults — see `docs/agents/triage-labels.md`.
- **Domain docs**: glossary at `GLOSSARY.md` (single context), ADRs at `docs/adr/`.
