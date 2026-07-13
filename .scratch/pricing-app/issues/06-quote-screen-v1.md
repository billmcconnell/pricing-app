# 06 — Quote screen v1 (year-1 List Price)

Status: done

## What to build

The Sales-facing core: search/pick a Customer (by Company Code or Account Name), pick an Environment if they have several, and see the year-1 **List Price** computed live by the cost model from the imported size and effective Growth Rate. Quotes are **ephemeral** — nothing is persisted; the screen is a calculator.

Role boundary matters here: Sales sees List Price and the inputs that explain it (DB size, growth), but **not** OPEX, margin, contingency, or any cost breakdown. Admin viewing the same screen may see the full breakdown.

Customers with no priceable Environment (exist commercially, no measured size) appear in search but clearly marked unpriceable — see the example dialogue in CONTEXT.md.

## Acceptance criteria

- [x] Sales can find a Customer either by Company Code or Account Name and get a List Price for a chosen Environment
- [x] MOLH-style Customers require choosing between their Environments; each prices separately
- [x] The price equals the cost-model engine's output for that Environment's grown size (integration test against known imported data)
- [x] Sales response payload contains no OPEX/margin/contingency fields (asserted in a test, not just hidden in UI)
- [x] Unpriceable Customers render an explicit "no measured Environment" state, not an error

## Blocked by

- 02-auth-two-roles.md
- 03-cost-model-engine.md
- 04-db-size-import.md
- 05-growth-rate-import.md

## Comments

Implemented 2026-07-13. Notes and decisions:

- **API**: `GET /api/quote/customers` (any authenticated user) returns the Sales-safe search list — code, name, environments with size/growth only; `GET /api/quote?environment=<identifier>` computes the quote live and persists nothing. The role boundary is in the payload shape: Sales gets identifier/customer, DB size, raw + effective Growth Rate (with defaulted flag), grown size, List Price, and quote timestamp; **Admin gets the same plus a `breakdown` object**. A test recursively collects every key in the Sales JSON and asserts none of opex/grossMargin/contingency/fixedCosts/variableCosts/snowflakeCredits/breakdown appear.
- **Integration fixtures**: with the full workbook feeds imported, OTQV quotes at $112,000 (matching the engine and the issue-03 fixture) and the two MOLH Environments price separately (MPCC_PROD $71,500 on real data).
- **UI**: the Home page is now the quote screen (nav already said "Quotes"). Search filters client-side over the full list (~420 rows — no server round-trip needed) matching Company Code or Account Name; one Environment auto-selects, several require an explicit choice; unpriceable Customers show "has no measured Environment yet — nothing is priceable until a database size is imported." Admin sees the shared CostBreakdownTable (extracted from the Cost Model page) below the quote.
- The walking skeleton's health display was dropped from the Home page; `/api/health` itself remains for probes.
- Screen notes "Quotes are not saved — prices reflect current data and Assumptions."
