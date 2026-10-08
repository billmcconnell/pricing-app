# 07 — Multi-Year Projection

Status: done

## What to build

Add the **Multi-Year Projection** to the quote screen: a number-of-years input (default 5). Per GLOSSARY.md, the projection grows the Environment's database size and re-runs the full cost model for each year — never compounds the price. Year 1 grows by the Environment's own effective Growth Rate; years 2+ grow by the floor rate (a ramp-up trend is not a steady state). Show a per-year breakdown (projected size + that year's List Price) and the total.

## Acceptance criteria

- [x] Quote screen shows year-by-year List Prices and a total for N years
- [x] Unit tests verify the growth schedule: size(1) = size × (1 + own rate); size(k>1) = size(k−1) × (1 + floor rate)
- [x] Each year's price is a full cost-model run on that year's size (test: a year crossing a credit-tier or price-floor boundary reprices accordingly)
- [x] A high-growth Environment (e.g. ratio > 1) produces sane later years — no compounding of the ramp rate

## Blocked by

- 06-quote-screen-v1.md

## Comments

Implemented 2026-07-13. Notes and decisions:

- **Engine**: `computeCost` was split so a shared `computeCostForGrownSize` prices an already-grown size; `projectMultiYear(inputs, years, assumptions)` (pure, in `costModel.ts`) builds the size schedule — year 1 by the own effective rate, years 2+ by the floor — and runs the full model per year. Year 1 of the projection is bit-identical to the single-year quote.
- **Boundary-crossing test**: 30 GB at the floor grows 39 → 111.4 GB over five years; the test asserts the credit allocation jumps from 200 to 250 credits/month in year 5 and the price lifts off the $30K floor — each year genuinely repriced, and the year-5 price is asserted to equal the margin formula on that year's OPEX, not any escalation of year 1.
- **No ramp compounding**: PKNM-style fixture (33.84 MB at a 98.24 ratio) — year 1 multiplies by 99.24, every later year by 1.3 only; five years out it's still under 10 GB and priced at the floor. A separate test pins that year-2 price < year-1 price × 1.3 (fixed costs don't scale), proving prices are recomputed rather than compounded.
- **API**: `/api/quote` gains `years` (default 5, integer 1–30, else 400). The projection is included in every quote response; rows expose year, projected size, and List Price only — per-year OPEX and credit allocation stay server-side for every role (Admin still has the year-1 breakdown).
- **UI**: the quote view gains a Years input (default 5) and the projection table with per-year projected size + List Price and a labeled total; changing Years re-fetches.
