# 11 — Copyable quote summary

Status: ready-for-agent

## What to build

A one-click "copy summary" on the quote screen producing a clean plain-text block suitable for pasting into email or Salesforce: Customer/Environment, selected Refresh Rate and Alternative Destination, year-1 List Price, the Multi-Year Projection breakdown and total, and the quote date. Quotes stay ephemeral — this is the artifact Sales walks away with, so it must be complete and unambiguous on its own (currency marked USD, per-year prices labeled). Never include OPEX, margin, or cost internals, regardless of the viewer's role.

## Acceptance criteria

- [ ] One click copies a plain-text summary to the clipboard; visible confirmation
- [ ] Summary includes customer, options, year-1 price, per-year projection, total, and date — all USD-labeled
- [ ] Summary contains no OPEX/margin/cost-breakdown lines even for Admin (asserted in a test)
- [ ] Text renders sanely pasted into a plain-text context (no markdown artifacts, aligned enough to read)

## Blocked by

- 08-addons-refresh-rate-alt-destination.md
