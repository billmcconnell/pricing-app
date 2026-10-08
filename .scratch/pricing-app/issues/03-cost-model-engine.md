# 03 — Cost model engine + seeded Assumptions

Status: done

## What to build

The heart of the app: a pure calculation module that takes an Environment's database size (GB) and Growth Rate and produces the full cost breakdown — fixed costs, variable costs scaled by grown size, contingency, Snowflake credit allocation by size tier — then OPEX, and List Price. Every constant is an **Assumption** stored in the database and seeded from the Excel workbook's current values (unit costs, 10% turnover, 10% contingency, 30% growth floor, credit tiers 200/250/400/500 at 90/150/200 GB grown size, $30K price floor, $500 rounding ceiling).

Two deliberate deviations from the workbook, both documented in ADRs — do not "fix" them to match the spreadsheet:

- List Price = OPEX ÷ (1 − gross margin), margin seeded at 60% — **not** the worksheet's `OPEX × 1.7` markup (ADR-0001)
- No Value Uplift step (ADR-0002)

Expose a compute endpoint and a minimal Admin-visible form (size + growth in, breakdown out) to prove the path end-to-end. Use GLOSSARY.md vocabulary throughout (OPEX, Gross Margin, List Price, Assumption).

The base-model formulas to transcribe live in the workbook's Pricing Worksheet (rows 17–49 for the 150 GB base model, rows 100+ for the per-client pipeline). Credit-tier thresholds in the workbook compare grown size in **MB** (90,000/150,000/200,000); the app works in GB.

## Acceptance criteria

- [x] Pure calc module with no I/O; unit tests verify each cost line against fixtures derived from the workbook's base model (150 GB, 10% turnover)
- [x] A test verifies List Price uses the gross-margin rule: seeded margin 60% ⇒ price = OPEX × 2.5, ceilinged to $500, floored at $30K
- [x] Credit allocation tier boundaries covered by tests (including exact-threshold values)
- [x] Assumptions are read from the database at compute time — changing a seeded value changes the next computation with no deploy
- [x] Compute endpoint + minimal form demonstrate size/growth → breakdown → List Price in the browser

## Blocked by

- 01-walking-skeleton.md

## Comments

Implemented 2026-07-12. Formulas extracted from the workbook's Pricing Worksheet with formulas + cached values intact; notes:

- **Pure module**: `server/src/costModel.ts` — `computeCost(inputs, assumptions)`, no I/O. Since every variable-cost line is linear in size, the engine computes lines directly at grown size instead of reproducing Excel's ÷150GB multiplier; results are identical (verified to 5 decimals against workbook rows).
- **Fixtures**: base model (150 GB ⇒ OPEX $15,242.366, every line asserted) plus two real per-client rows — OTQV (1,003,483.3 MB, 30% growth ⇒ OPEX $44,617.9632, List Price $112,000 under ADR-0001) and HFNQ (own 87% growth rate above the floor).
- **Assumptions**: `assumptions` table (key, value, label, category `unit-cost`/`behavioral`/`commercial`, unit) seeded with 25 values from the 2026-07-08 workbook snapshot. Seeding is `onConflictDoNothing`, so Admin edits survive restarts. Credit tiers stored as scalar rows (threshold + credits pairs) for easy editing in issue 10.
- **Tier boundaries** use strict `>` like the worksheet IF chain: grown size exactly 90/150/200 GB stays in the lower tier. Covered by tests either side of each threshold.
- The engine applies the growth floor internally (`effective = max(rate, floor)`) and reports the effective rate in the breakdown — consistent with issue 05's read-time flooring.
- **Endpoint**: `GET /api/cost-model/compute?dbSizeGb=&growthRate=` — Admin-only, since the breakdown exposes OPEX/margin/contingency. Issue 06's quote screen will expose List Price without internals for Sales.
- **UI**: `/admin/cost-model` — size + growth in, full breakdown + List Price out.
- Hard-coded structural constants (not Assumptions): 730 hrs/month, 12 months/year, 2 full reloads/year.
