# 05 — Growth Rate import

Status: done

## What to build

Admin uploads the Growth Rate feed (identifier + growth ratio, where 0.20 = 20%/yr; large ratios on small new databases are legitimate). Rates attach to existing Environments. The growth **floor** is an Assumption (seeded 30%) applied at read time, not baked into stored values — so changing the floor re-floors everyone. Environments with no imported rate price at the floor rate (agreed default). Environment list gains a growth column showing raw and effective (floored) rate, plus feed staleness like the DB-size feed.

## Acceptance criteria

- [x] Uploading the current workbook's Growth Rate data attaches rates to ~356 Environments
- [x] Stored value is the raw ratio; the effective rate = max(raw, floor Assumption) is computed at read time — a floor change is reflected without re-import
- [x] An Environment absent from the feed gets the floor rate as its effective rate, visibly marked as defaulted
- [x] Rows referencing unknown Environments are reported, not silently dropped
- [x] Floor behavior and defaulting covered by tests

## Blocked by

- 04-db-size-import.md

## Comments

Implemented 2026-07-12. Notes and decisions:

- **Exact counts**: the workbook's Growth Rate sheet has 358 data rows with duplicate `EVSG` and `CURE` (first-wins + warning, as with spaceused) → **356 unique identifiers, all present in the spaceused feed**. The remaining 10 Environments have no rate and price at the floor, marked "(defaulted to floor)".
- **Raw column D is what's imported.** The sheet's column E is `MAX(D, 0.3)` — the pre-floored value the old pipeline consumed. The app stores raw and floors at read time, so a floor Assumption change re-floors everyone instantly (covered by a test that flips `growth_floor` to 0.5 in the DB and sees effective rates change with stored values untouched).
- **Column detection**: the parser defaults to two columns (identifier + ratio) but a header row selects the rate column by name (`Growth rate` / `growth ratio`) — so uploading a full five-column sheet export reads raw column D, never the size column and never the pre-floored column E.
- **Unknown identifiers don't reject the file** (unlike malformed rows, which still 422 the whole upload): rates attach to the Environments that exist, and unknown rows are listed in the diff/preview. Rationale: the criterion says "reported, not silently dropped", and a growth feed can legitimately lead the size feed.
- Validation accepts 0 and very large ratios (98.24 on a 33.84 MB database is real data); negative ratios are rejected.
- `/api/customers` now returns `growthRate` (raw or null), `effectiveGrowthRate`, `growthDefaulted`, and the current `growthFloor`; the Imports page shows raw + effective columns, the floor, and growth-feed staleness like the other feeds.
