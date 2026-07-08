# 05 — Growth Rate import

Status: ready-for-agent

## What to build

Admin uploads the Growth Rate feed (identifier + growth ratio, where 0.20 = 20%/yr; large ratios on small new databases are legitimate). Rates attach to existing Environments. The growth **floor** is an Assumption (seeded 30%) applied at read time, not baked into stored values — so changing the floor re-floors everyone. Environments with no imported rate price at the floor rate (agreed default). Environment list gains a growth column showing raw and effective (floored) rate, plus feed staleness like the DB-size feed.

## Acceptance criteria

- [ ] Uploading the current workbook's Growth Rate data attaches rates to ~356 Environments
- [ ] Stored value is the raw ratio; the effective rate = max(raw, floor Assumption) is computed at read time — a floor change is reflected without re-import
- [ ] An Environment absent from the feed gets the floor rate as its effective rate, visibly marked as defaulted
- [ ] Rows referencing unknown Environments are reported, not silently dropped
- [ ] Floor behavior and defaulting covered by tests

## Blocked by

- 04-db-size-import.md
