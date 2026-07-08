# 03 — Cost model engine + seeded Assumptions

Status: ready-for-agent

## What to build

The heart of the app: a pure calculation module that takes an Environment's database size (GB) and Growth Rate and produces the full cost breakdown — fixed costs, variable costs scaled by grown size, contingency, Snowflake credit allocation by size tier — then OPEX, and List Price. Every constant is an **Assumption** stored in the database and seeded from the Excel workbook's current values (unit costs, 10% turnover, 10% contingency, 30% growth floor, credit tiers 200/250/400/500 at 90/150/200 GB grown size, $30K price floor, $500 rounding ceiling).

Two deliberate deviations from the workbook, both documented in ADRs — do not "fix" them to match the spreadsheet:

- List Price = OPEX ÷ (1 − gross margin), margin seeded at 60% — **not** the worksheet's `OPEX × 1.7` markup (ADR-0001)
- No Value Uplift step (ADR-0002)

Expose a compute endpoint and a minimal Admin-visible form (size + growth in, breakdown out) to prove the path end-to-end. Use CONTEXT.md vocabulary throughout (OPEX, Gross Margin, List Price, Assumption).

The base-model formulas to transcribe live in the workbook's Pricing Worksheet (rows 17–49 for the 150 GB base model, rows 100+ for the per-client pipeline). Credit-tier thresholds in the workbook compare grown size in **MB** (90,000/150,000/200,000); the app works in GB.

## Acceptance criteria

- [ ] Pure calc module with no I/O; unit tests verify each cost line against fixtures derived from the workbook's base model (150 GB, 10% turnover)
- [ ] A test verifies List Price uses the gross-margin rule: seeded margin 60% ⇒ price = OPEX × 2.5, ceilinged to $500, floored at $30K
- [ ] Credit allocation tier boundaries covered by tests (including exact-threshold values)
- [ ] Assumptions are read from the database at compute time — changing a seeded value changes the next computation with no deploy
- [ ] Compute endpoint + minimal form demonstrate size/growth → breakdown → List Price in the browser

## Blocked by

- 01-walking-skeleton.md
