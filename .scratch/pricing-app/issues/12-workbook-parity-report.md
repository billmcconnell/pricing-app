# 12 — Workbook parity report

Status: ready-for-agent

## What to build

A verification harness that computes prices for the entire imported client base (~300 Environments) and diffs them against the legacy Excel dashboard's prices, producing a reviewable report. Two deltas are expected and must be accounted for rather than flagged as errors: the gross-margin rule (ADR-0001, prices ≈ 2.5/1.7 higher before floors) and the removed Value Uplift (ADR-0002, −$43,500 for big Customers). After normalizing for those, remaining differences indicate formula transcription errors in the engine — that's what this slice exists to catch.

The legacy expected values come from the workbook's per-client table (the column the old dashboard served). Extract them once into a fixture; this is a point-in-time check, not a live Excel dependency.

## Acceptance criteria

- [ ] A runnable report lists every Environment: app price, legacy price, delta, and delta-after-normalizing-for-ADRs
- [ ] Normalized deltas are zero (within rounding/ceiling tolerance) for the client base, or each exception is individually explained
- [ ] The report runs in CI/test as a regression gate against fixture data
- [ ] Accelerated Updates 1-Minute prices included in the parity check (per issue 08's frozen-anchor seed)

## Blocked by

- 05-growth-rate-import.md
- 08-addons-refresh-rate-alt-destination.md
