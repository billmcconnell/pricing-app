# 10 — Assumptions admin screen + change log

Status: ready-for-agent

## What to build

The Admin screen for every **Assumption** in the model, grouped as in CONTEXT.md: unit costs (Snowflake credit price, S3/DMS rates…), behavioral assumptions (turnover, contingency, growth floor), and commercial policy (gross margin, price floor, credit tiers, add-on rates and floors, guardrail threshold, rounding). Each Assumption displays a human description — the workbook's margin-vs-markup confusion happened partly because constants lived unlabeled in cells (ADR-0001).

Every edit appends to a change log (when, which Assumption, old → new) shown on the same screen — this replaces the Excel Change Log tab. No versioning beyond that; quotes are ephemeral and always price from current values.

## Acceptance criteria

- [ ] Admin can view and edit every seeded Assumption, grouped, each with a description; Sales cannot reach this screen or its endpoints
- [ ] An edit takes effect on the next quote computation immediately
- [ ] Each edit produces a change-log entry (timestamp, assumption, old → new); the log is viewable and ordered
- [ ] Basic validation: percentages within sane bounds, prices non-negative, tier thresholds strictly increasing
- [ ] Edit → recompute → change-log flow covered by an integration test

## Blocked by

- 02-auth-two-roles.md
- 03-cost-model-engine.md
