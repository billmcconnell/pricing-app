# 11 — Copyable quote summary

Status: done (options lines pending issue 08)

## What to build

A one-click "copy summary" on the quote screen producing a clean plain-text block suitable for pasting into email or Salesforce: Customer/Environment, selected Refresh Rate and Alternative Destination, year-1 List Price, the Multi-Year Projection breakdown and total, and the quote date. Quotes stay ephemeral — this is the artifact Sales walks away with, so it must be complete and unambiguous on its own (currency marked USD, per-year prices labeled). Never include OPEX, margin, or cost internals, regardless of the viewer's role.

## Acceptance criteria

- [x] One click copies a plain-text summary to the clipboard; visible confirmation
- [x] Summary includes customer, ~~options,~~ year-1 price, per-year projection, total, and date — all USD-labeled *(options lines deliberately omitted until issue 08 ships the add-ons — Bill's call, 2026-07-13)*
- [x] Summary contains no OPEX/margin/cost-breakdown lines even for Admin (asserted in a test)
- [x] Text renders sanely pasted into a plain-text context (no markdown artifacts, aligned enough to read)

## Blocked by

- 08-addons-refresh-rate-alt-destination.md

## Comments

Implemented 2026-07-13, without the Refresh Rate / Alternative Destination lines (issue 08 skipped; add them to `buildQuoteSummary` when the add-ons land — the function has a marker comment).

- **`web/src/quoteSummary.ts`**: pure `buildQuoteSummary(quote)` → plain text. Takes only Sales-safe fields; a test passes a quote object *with* an Admin breakdown attached and asserts the output is byte-identical and free of OPEX/margin/contingency/credit words and amounts.
- **Format**: header with quote date, Customer (code — account name), Environment identifier, IMOS DB Size + effective Growth Rate, `Year-1 List Price: USD n per year`, per-year projection rows (right-aligned size column, every price `USD`-prefixed and "per year"-labeled), labeled total, and a footer restating the date and that quotes are not stored. No `$` symbol anywhere — everything is explicit `USD`. No markdown characters (asserted).
- A defaulted Growth Rate renders as "(standard rate)" — customer-safe wording rather than internal floor vocabulary.
- **UI**: "Copy summary" button next to the year-1 price uses `navigator.clipboard.writeText` and shows "Copied to clipboard." (role=status) for 2.5s. Clipboard interaction covered in App.test with a stubbed clipboard.
