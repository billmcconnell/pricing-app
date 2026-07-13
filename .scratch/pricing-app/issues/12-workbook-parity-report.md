# 12 — Workbook parity report

Status: done (except Accelerated Updates parity — blocked by issue 08)

## What to build

A verification harness that computes prices for the entire imported client base (~300 Environments) and diffs them against the legacy Excel dashboard's prices, producing a reviewable report. Two deltas are expected and must be accounted for rather than flagged as errors: the gross-margin rule (ADR-0001, prices ≈ 2.5/1.7 higher before floors) and the removed Value Uplift (ADR-0002, −$43,500 for big Customers). After normalizing for those, remaining differences indicate formula transcription errors in the engine — that's what this slice exists to catch.

The legacy expected values come from the workbook's per-client table (the column the old dashboard served). Extract them once into a fixture; this is a point-in-time check, not a live Excel dependency.

## Acceptance criteria

- [x] A runnable report lists every Environment: app price, legacy price, delta, and delta-after-normalizing-for-ADRs
- [x] Normalized deltas are zero (within rounding/ceiling tolerance) for the client base, or each exception is individually explained
- [x] The report runs in CI/test as a regression gate against fixture data
- [ ] Accelerated Updates 1-Minute prices included in the parity check (per issue 08's frozen-anchor seed) — **blocked: issue 08 was deliberately skipped (2026-07-13); extend the fixture and report when 08 lands**

## Blocked by

- 05-growth-rate-import.md
- 08-addons-refresh-rate-alt-destination.md

## Comments

Implemented 2026-07-13, minus the Accelerated Updates criterion (issue 08 skipped by Bill's call; the AU column should be added to `legacy-prices.csv` and `parityReport.ts` when 08 is built).

**Result: 289/289 Environments at parity. Every normalized delta is exactly $0 and the engine reproduces the workbook OPEX to the cent on every client — no formula transcription errors.**

Notes and findings:

- **What the legacy dashboard actually served**: Pricing Worksheet column **U** ("VALUE UPLIFT LP") via `VLOOKUP(..., 20)` — `IF(UserCount>50 OR ACV>299999, P+43500, Q)` with P = `CEILING(OPEX×1.7, 500)` and Q = `MAX(P, 30000)`. Two workbook quirks matter for normalization: (1) the uplift is added to the *pre-floor* P, so uplifted rows skip the $30K floor — uplift amounts in the data range $32K–$43.5K, not a uniform $43.5K; (2) the ACV lookup uses approximate-match VLOOKUP on unsorted data (a latent workbook bug) — irrelevant here because the fixture takes the cached served values as ground truth.
- **Fixture** (`server/test/fixtures/legacy-prices.csv`): identifier, workbook OPEX (col N), served price (col U), uplift amount (col V), extracted once from the 2026-07-08 workbook. 301 table rows → 289 usable: **12 rows served `#N/A` by the old dashboard** (codes missing from the USER COUNT sheet cascade an error) — the legacy dashboard literally errored for those clients; excluded from the fixture. The table also never priced the two MOLH environment rows (its VLOOKUP keyed bare codes only).
- **Normalization**: `predictedLegacy = upliftFlag ? ceil500(appOpex×1.7)+43500 : max(ceil500(appOpex×1.7), 30000)`; `normalizedDelta = servedPrice − predictedLegacy`. Legacy rules are frozen in `parityReport.ts` (`LEGACY` constant) for normalization only.
- **Regression gate** (`test/parityReport.test.ts`): asserts all 289 normalized deltas are exactly 0, OPEX matches within $0.01, raw deltas point the ADR-expected direction for non-uplifted rows, and — sanity-checking the gate itself — a deliberately corrupted Assumption produces exceptions.
- **Runnable report**: `pnpm report:parity` (in `server/`) against the app database; prints exceptions by default, `--all` for every Environment, exit code 1 on any exception. Also observed: for the very biggest uplifted clients the app price is a few $K *below* legacy (margin increase < removed uplift) — deliberate per the ADRs, visible in the raw delta column.
