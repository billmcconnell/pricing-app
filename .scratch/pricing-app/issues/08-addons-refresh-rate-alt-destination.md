# 08 — Add-ons: Accelerated Updates + Alternative Destination

Status: ready-for-agent

## What to build

Quote screen options, per GLOSSARY.md: a **Refresh Rate** picker (30 Minutes included / 15 Minutes / 1 Minute — the 10-Minute option is retired) and an **Alternative Destination** toggle (flat price, Assumption seeded $15,000).

**Accelerated Updates** are priced from an explicit $/GB/yr Assumption applied to the Environment's grown size — deliberately not the workbook's live comparison against the RTEU reference client. Seed the 1-Minute rate by freezing that anchor once: 18,750 ÷ RTEU's grown DB size (GB) from the current workbook data. The 15-Minute price is a multiplier Assumption (seeded 50%) on the 1-Minute price; per-tier floors are Assumptions (seeded $18,000 / $9,000).

In the Multi-Year Projection (agreed defaults): Accelerated Updates recompute each year on that year's grown size; Alternative Destination stays flat per year.

## Acceptance criteria

- [ ] Refresh Rate offers exactly 30 Minutes ($0), 15 Minutes, 1 Minute
- [ ] 1-Minute price = rate Assumption × grown GB, floored; 15-Minute = multiplier × 1-Minute price, floored (unit tests, including floor-binding cases)
- [ ] Seeded rate reproduces the workbook's current 1-Minute prices for a sample of clients (within rounding)
- [ ] Projection years recompute Accelerated Updates on grown size; Alternative Destination adds flat per year (tests)
- [ ] Quote screen shows base List Price and selected add-ons as separate lines

## Blocked by

- 07-multi-year-projection.md
