# 10 — Assumptions admin screen + change log

Status: done

## What to build

The Admin screen for every **Assumption** in the model, grouped as in GLOSSARY.md: unit costs (Snowflake credit price, S3/DMS rates…), behavioral assumptions (turnover, contingency, growth floor), and commercial policy (gross margin, price floor, credit tiers, add-on rates and floors, guardrail threshold, rounding). Each Assumption displays a human description — the workbook's margin-vs-markup confusion happened partly because constants lived unlabeled in cells (ADR-0001).

Every edit appends to a change log (when, which Assumption, old → new) shown on the same screen — this replaces the Excel Change Log tab. No versioning beyond that; quotes are ephemeral and always price from current values.

## Acceptance criteria

- [x] Admin can view and edit every seeded Assumption, grouped, each with a description; Sales cannot reach this screen or its endpoints
- [x] An edit takes effect on the next quote computation immediately
- [x] Each edit produces a change-log entry (timestamp, assumption, old → new); the log is viewable and ordered
- [x] Basic validation: percentages within sane bounds, prices non-negative, tier thresholds strictly increasing
- [x] Edit → recompute → change-log flow covered by an integration test

## Blocked by

- 02-auth-two-roles.md
- 03-cost-model-engine.md

## Comments

Implemented 2026-07-13. Notes and decisions:

- **API** (all admin-only, Sales 403s tested): `GET /api/assumptions`, `PATCH /api/assumptions/:key { value }`, `GET /api/assumptions/changes` (newest first, joined with labels). The PATCH writes the value and the log entry in one transaction; a same-value save is a no-op with no log entry.
- **Change log** (`assumption_changes` table): timestamp, key, old → new, and **who** (`changedBy` = the editing admin's email — a small addition beyond the spec, since auth makes it free). Append-only; replaces the Excel Change Log tab.
- **Validation** in `validateAssumptionChange`: `gross_margin` must be ≥ 0 and strictly < 1 (it divides); `price_rounding` and `dms_tasks_per_instance` must be > 0 (divisors/step); other `ratio`-unit values bounded 0–1; everything else non-negative; credit tier thresholds must stay strictly increasing (cross-checked against the other two thresholds, so a reshuffle is possible in a valid order — covered by tests).
- **Integration test**: quote OTQV ($112,000) → PATCH gross_margin 0.5 via the API → next quote is $89,500 → change log holds `0.6 → 0.5` with author and timestamp.
- **UI**: `/admin/assumptions` — three groups (Unit costs / Behavioral assumptions / Commercial policy), every row shows the human label + unit with inline edit and per-row Save (disabled until dirty); the change log renders below on the same screen. Nav link added, admin-only.
- Verified live on the dev DB: 26 Assumptions (the guardrail share from issue 09 retro-seeded on boot as designed); an edit moved a real quote immediately and the revert restored it, both logged.
