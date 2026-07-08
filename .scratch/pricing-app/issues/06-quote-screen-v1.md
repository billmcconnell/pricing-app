# 06 — Quote screen v1 (year-1 List Price)

Status: ready-for-agent

## What to build

The Sales-facing core: search/pick a Customer (by Company Code or Account Name), pick an Environment if they have several, and see the year-1 **List Price** computed live by the cost model from the imported size and effective Growth Rate. Quotes are **ephemeral** — nothing is persisted; the screen is a calculator.

Role boundary matters here: Sales sees List Price and the inputs that explain it (DB size, growth), but **not** OPEX, margin, contingency, or any cost breakdown. Admin viewing the same screen may see the full breakdown.

Customers with no priceable Environment (exist commercially, no measured size) appear in search but clearly marked unpriceable — see the example dialogue in CONTEXT.md.

## Acceptance criteria

- [ ] Sales can find a Customer either by Company Code or Account Name and get a List Price for a chosen Environment
- [ ] MOLH-style Customers require choosing between their Environments; each prices separately
- [ ] The price equals the cost-model engine's output for that Environment's grown size (integration test against known imported data)
- [ ] Sales response payload contains no OPEX/margin/contingency fields (asserted in a test, not just hidden in UI)
- [ ] Unpriceable Customers render an explicit "no measured Environment" state, not an error

## Blocked by

- 02-auth-two-roles.md
- 03-cost-model-engine.md
- 04-db-size-import.md
- 05-growth-rate-import.md
