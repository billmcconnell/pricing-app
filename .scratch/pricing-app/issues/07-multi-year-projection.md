# 07 — Multi-Year Projection

Status: ready-for-agent

## What to build

Add the **Multi-Year Projection** to the quote screen: a number-of-years input (default 5). Per CONTEXT.md, the projection grows the Environment's database size and re-runs the full cost model for each year — never compounds the price. Year 1 grows by the Environment's own effective Growth Rate; years 2+ grow by the floor rate (a ramp-up trend is not a steady state). Show a per-year breakdown (projected size + that year's List Price) and the total.

## Acceptance criteria

- [ ] Quote screen shows year-by-year List Prices and a total for N years
- [ ] Unit tests verify the growth schedule: size(1) = size × (1 + own rate); size(k>1) = size(k−1) × (1 + floor rate)
- [ ] Each year's price is a full cost-model run on that year's size (test: a year crossing a credit-tier or price-floor boundary reprices accordingly)
- [ ] A high-growth Environment (e.g. ratio > 1) produces sane later years — no compounding of the ramp rate

## Blocked by

- 06-quote-screen-v1.md
